import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport,canManageYoutubeSubject } from "@/lib/youtube-access";
export const runtime="nodejs";
const schema=z.object({course_id:z.string().uuid()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const {id}=await params;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Choose an authorized destination course."},{status:400});
 let job;
 try{job=await loadAuthorizedImport(actor.profile,id);}
 catch{return NextResponse.json({error:"Could not verify playlist ownership."},{status:503});}
 if(!job||job.status!=="review"||job.target_course_id)
   return NextResponse.json({error:"This job is not an unassigned review draft."},{status:409});
 try{if(!await canManageYoutubeSubject(actor.profile,job.subject_id,parsed.data.course_id))
   return NextResponse.json({error:"Not assigned to the destination subject."},{status:403});}
 catch{return NextResponse.json({error:"Could not check target course."},{status:503});}
 const {error}=await createAdminClient().from("youtube_import_jobs")
   .update({target_course_id:parsed.data.course_id,updated_at:new Date().toISOString()})
   .eq("id",job.id).eq("college_id",actor.profile.college_id).eq("status","review");
 if(error)return NextResponse.json({error:"Could not attach playlist to this course."},{status:503});
 return NextResponse.json({success:true});
}
