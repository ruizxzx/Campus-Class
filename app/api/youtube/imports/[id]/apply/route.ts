import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport } from "@/lib/youtube-access";
import { describeYoutubeApplyError } from "@/lib/youtube-apply-error";
export const runtime="nodejs";export const maxDuration=60;
const item=z.object({
  item_id:z.string().uuid(),
  title:z.string().trim().min(2).max(180),
  description:z.string().max(20000).default(""),
}).strict();
const schema=z.object({
  title:z.string().trim().min(2).max(180),
  description:z.string().max(10000).default(""),
  publish:z.boolean().default(false),
  overwrite_titles:z.boolean().default(false),
  modules:z.array(z.object({
    title:z.string().trim().min(2).max(180),
    lessons:z.array(item).min(1).max(500),
  }).strict()).min(1).max(80),
}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role==="student")return NextResponse.json({error:"Only faculty can publish courses."},{status:403});
 const {id}=await params;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Review chapter titles and selected video lectures."},{status:400});
 const body=parsed.data;
 const lessons=body.modules.flatMap(m=>m.lessons);
 if(!lessons.length||lessons.length>1200||new Set(lessons.map(x=>x.item_id)).size!==lessons.length)
   return NextResponse.json({error:"Select distinct videos, at most 1,200 per import."},{status:400});
 let job;
 try{job=await loadAuthorizedImport(actor.profile,id);}
 catch{return NextResponse.json({error:"Could not verify faculty course access."},{status:503});}
 if(!job)return NextResponse.json({error:"Import not found or class permission changed."},{status:404});
 if(!["review","applied"].includes(job.status))
   return NextResponse.json({error:"Finish fetching the playlist before applying it."},{status:409});
 const db=createAdminClient();
 const {data,error}=await db.rpc("apply_youtube_playlist_import",{
   p_job_id:job.id,p_actor:actor.userId,p_title:body.title,
   p_description:body.description,p_publish:body.publish,
   p_modules:body.modules,p_overwrite_titles:body.overwrite_titles,
 });
 if(error){
   const failure=describeYoutubeApplyError(error);
   console.error("Atomic YouTube course apply rejected",{code:error.code,reason:failure.reason});
   return NextResponse.json({error:failure.message},{status:failure.status});
 }
 return NextResponse.json({success:true,...data});
}
