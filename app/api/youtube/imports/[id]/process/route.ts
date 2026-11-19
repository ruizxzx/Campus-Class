import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport } from "@/lib/youtube-access";
import { processSpecificYoutubeJob } from "@/lib/youtube-worker";
export const runtime="nodejs";export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const {id}=await params;
 let job;
 try{job=await loadAuthorizedImport(actor.profile,id);}
 catch{return NextResponse.json({error:"Could not authorize this job."},{status:503});}
 if(!job)return NextResponse.json({error:"Import not found."},{status:404});
 const body=await request.json().catch(()=>({})) as {action?:string};
 const db=createAdminClient();
 if(body.action==="cancel"){
   if(job.status==="applied")return NextResponse.json({error:"An applied import cannot be cancelled; it already belongs to a course."},{status:409});
   const {error}=await db.from("youtube_import_jobs").update({status:"cancelled",
     lock_expires_at:null,updated_at:new Date().toISOString()})
     .eq("id",id).eq("college_id",actor.profile.college_id).neq("status","applied");
   if(error)return NextResponse.json({error:"Could not cancel the import."},{status:503});
   return NextResponse.json({status:"cancelled"});
 }
 if(body.action==="retry"){
   if(!["failed","cancelled"].includes(job.status))
     return NextResponse.json({error:"This job is not retryable."},{status:409});
   const {error}=await db.from("youtube_import_jobs").update({status:"queued",
     attempts:0,lock_expires_at:null,failure_code:null,failure_message:null})
     .eq("id",id).eq("college_id",actor.profile.college_id);
   if(error)return NextResponse.json({error:"Could not restart import."},{status:503});
 }
 if(body.action!=="retry"&&body.action!=="process")
   return NextResponse.json({error:"Unknown import operation."},{status:400});
 if(!["queued","processing","failed","cancelled"].includes(job.status))
   return NextResponse.json({error:"This import is already ready for review or applied."},{status:409});
 try{
   const result=await processSpecificYoutubeJob(id);
   return NextResponse.json(result);
 }catch(error){
   console.error("YouTube job processing unavailable",{reason:error instanceof Error?error.message:"unknown"});
   return NextResponse.json({error:"Cannot process this playlist yet. Apply migrations 045–046 and configure YouTube Data API."},{status:503});
 }
}
