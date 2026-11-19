import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePlaylistUrl, YouTubeApiError } from "@/lib/youtube-data";
import { canManageYoutubeSubject } from "@/lib/youtube-access";
export const runtime="nodejs";
const schema=z.object({
  urls:z.array(z.string().trim().min(15).max(1500)).min(1).max(5),
  subject_id:z.string().uuid(),course_id:z.string().uuid().nullable().optional(),
  mode:z.enum(["import","sync"]).default("import"),
  grouping:z.enum(["sequential","rule","ai"]).default("sequential"),
  idempotency_key:z.string().uuid(),
}).strict();
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(!["faculty","admin"].includes(actor.profile.role))
   return NextResponse.json({error:"Only assigned faculty or administrators may import courses."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Choose a subject and 1–5 valid playlist links."},{status:400});
 const body=parsed.data;
 let ids:string[];
 try{ids=body.urls.map(parsePlaylistUrl);}
 catch(error){return NextResponse.json({error:error instanceof YouTubeApiError?error.message:"Invalid playlist link."},{status:400});}
 if(new Set(ids).size!==ids.length)return NextResponse.json({error:"Each playlist may be imported once per batch."},{status:400});
 try{
   if(!await canManageYoutubeSubject(actor.profile,body.subject_id,body.course_id))
     return NextResponse.json({error:"You are not assigned to teach this subject or course."},{status:403});
 }catch{return NextResponse.json({error:"Unable to check course authorization."},{status:503});}
 if(body.mode==="sync"&&!body.course_id)
   return NextResponse.json({error:"Choose the existing course to synchronize."},{status:400});
 const db=createAdminClient(),college=actor.profile.college_id;
 const {count,error:countError}=await db.from("youtube_import_jobs").select("id",{count:"exact",head:true})
   .eq("college_id",college).eq("created_by",actor.userId)
   .in("status",["queued","processing","review"]);
 if(countError)return NextResponse.json({error:"Could not check current imports."},{status:503});
 if((count??0)+ids.length>15)return NextResponse.json({
   error:"You already have too many open playlist jobs. Finish or cancel an import before creating more.",
 },{status:429});
 if(body.mode==="sync"){
   const {data:found,error}=await db.from("youtube_playlist_sources").select("playlist_id")
     .eq("college_id",college).eq("course_id",body.course_id).in("playlist_id",ids);
   if(error||found?.length!==ids.length)return NextResponse.json({
     error:"Synchronize only playlists already imported into the selected course.",
   },{status:403});
 }
 const batchId=randomUUID();
 const jobs=[];
 for(const id of ids){
   const idem=createHash("sha256")
     .update([actor.userId,body.idempotency_key,id,body.course_id??"new",body.mode].join(":"))
     .digest("hex");
   const {data,error}=await db.from("youtube_import_jobs").insert({
     college_id:college,created_by:actor.userId,
     subject_id:body.subject_id,target_course_id:body.course_id??null,
     playlist_id:id,batch_id:batchId,idempotency_key:idem,
     grouping:body.grouping,mode:body.mode,status:"queued",
   }).select("id,status,playlist_id,playlist_title").maybeSingle();
   if(error?.code==="23505"){
     const {data:existing,error:existingError}=await db.from("youtube_import_jobs")
       .select("id,status,playlist_id,playlist_title").eq("college_id",college)
       .eq("created_by",actor.userId).eq("idempotency_key",idem).maybeSingle();
     if(existingError||!existing)return NextResponse.json({error:"Could not resume existing import."},{status:503});
     jobs.push(existing);continue;
   }
   if(error||!data){
     console.error("YouTube job creation failed",{code:error?.code});
     return NextResponse.json({error:"Could not save this import job. Already created jobs are safe; retry with the same request key."},{status:503});
   }
   jobs.push(data);
 }
 return NextResponse.json({jobs,batch_id:batchId},{status:201});
}
export async function GET(){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role==="student")return NextResponse.json({jobs:[]});
 const db=createAdminClient();
 const {data,error}=await db.from("youtube_import_jobs")
   .select("id,status,mode,playlist_title,playlist_id,expected_count,processed_count,created_at,target_course_id,failure_message")
   .eq("college_id",actor.profile.college_id).eq("created_by",actor.userId)
   .order("created_at",{ascending:false}).limit(30);
 if(error)return NextResponse.json({error:"Could not retrieve recent playlist jobs."},{status:503});
 return NextResponse.json({jobs:data??[]});
}
