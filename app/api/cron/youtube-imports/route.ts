import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processQueuedYoutubeJobs } from "@/lib/youtube-worker";
import { canManageYoutubeSubject } from "@/lib/youtube-access";
import type { Profile } from "@/types/database";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=120;
function isAuthorized(request:Request){
 const key=process.env.CRON_SECRET;
 const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
 if(!key||!supplied)return false;
 const expected=Buffer.from(key),actual=Buffer.from(supplied);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export async function GET(request:Request){
 if(!isAuthorized(request))return NextResponse.json({error:"Unauthorized."},{status:401});
 const db=createAdminClient();
 let queued=0,skipped=0;
 // Scan only a bounded number of connected sources per daily execution.
 // Completed student progress, removed lessons and certificates are NEVER deleted.
 const {data:sources,error}=await db.from("youtube_playlist_sources")
   .select("id,college_id,course_id,playlist_id,created_by,last_checked_at,automatic_additions")
   .eq("sync_enabled",true).or("last_checked_at.is.null,last_checked_at.lt."+
     new Date(Date.now()-24*3600*1000).toISOString())
   .order("last_checked_at",{ascending:true,nullsFirst:true}).limit(25);
 if(error)return NextResponse.json({error:"Could not load playlist sync schedule."},{status:503});
 for(const source of sources??[]){
   const {data:course,error:courseError}=await db.from("courses")
     .select("id,subject_id,status").eq("id",source.course_id)
     .eq("college_id",source.college_id).maybeSingle();
   const {data:profile,error:profileError}=await db.from("profiles")
     .select("*").eq("id",source.created_by).eq("college_id",source.college_id).maybeSingle();
   if(courseError||profileError||!course||!profile||profile.status!=="active"){skipped++;continue;}
   try{if(!await canManageYoutubeSubject(profile as Profile,course.subject_id,course.id)){skipped++;continue;}}
   catch{skipped++;continue;}
   const {count,error:openError}=await db.from("youtube_import_jobs")
     .select("id",{count:"exact",head:true}).eq("college_id",source.college_id)
     .eq("target_course_id",source.course_id).eq("playlist_id",source.playlist_id)
     .eq("mode","sync").in("status",["queued","processing","review"]);
   if(openError||count){skipped++;continue;}
   const day=new Date().toISOString().slice(0,10);
   const idem=createHash("sha256").update(["sync",source.id,day].join(":")).digest("hex");
   const {error:jobError}=await db.from("youtube_import_jobs").insert({
     college_id:source.college_id,created_by:source.created_by,subject_id:course.subject_id,
     target_course_id:source.course_id,playlist_id:source.playlist_id,
     batch_id:randomUUID(),idempotency_key:idem,mode:"sync",status:"queued",
   });
   if(jobError&&jobError.code!=="23505"){skipped++;continue;}
   queued++;
 }
 let processed;
 try{processed=await processQueuedYoutubeJobs(3);}
 catch(error){
   console.error("YouTube sync worker unavailable",{reason:error instanceof Error?error.message:"unknown"});
   return NextResponse.json({error:"Could not run YouTube playlist workers.",queued,skipped},{status:503});
 }
 // Stale API metadata is removed from completed jobs after 30 days; the
 // source association and college-owned teaching records are retained.
 const stale=new Date(Date.now()-30*86400000).toISOString();
 const {data:oldJobs,error:oldError}=await db.from("youtube_import_jobs").select("id,college_id")
   .lt("created_at",stale).in("status",["applied","failed","cancelled"]).limit(80);
 if(!oldError){
   for(const job of oldJobs??[]){
     await db.from("youtube_import_items").delete().eq("college_id",job.college_id).eq("job_id",job.id);
     await db.from("youtube_import_jobs").update({
       playlist_title:null,playlist_description:null,playlist_thumbnail:null,
     }).eq("college_id",job.college_id).eq("id",job.id);
   }
 }
 return NextResponse.json({success:true,queued,skipped,processed});
}
