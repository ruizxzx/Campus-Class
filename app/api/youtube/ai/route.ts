import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport } from "@/lib/youtube-access";
import { completeWithOpenRouter, OpenRouterError } from "@/lib/openrouter";
export const runtime="nodejs";
const schema=z.object({job_id:z.string().uuid()}).strict();
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid import job."},{status:400});
 let job;
 try{job=await loadAuthorizedImport(actor.profile,parsed.data.job_id);}
 catch{return NextResponse.json({error:"Could not validate the course."},{status:503});}
 if(!job||job.status!=="review")return NextResponse.json({error:"Complete playlist fetching before AI grouping."},{status:409});
 const db=createAdminClient();
 const {data,error}=await db.from("youtube_import_items")
   .select("id,title,description").eq("college_id",actor.profile.college_id)
   .eq("job_id",job.id).eq("availability","available")
   .order("playlist_position").limit(60);
 if(error)return NextResponse.json({error:"Could not read playlist lecture titles."},{status:503});
 if(!data?.length)return NextResponse.json({error:"No available videos for AI grouping."},{status:409});
 const input=data.map((v,i)=>({number:i+1,id:v.id,title:v.title,
   description:v.description.slice(0,120)}));
 try{
   const raw=await completeWithOpenRouter(actor.profile,[
     {role:"system",content:"You are a college course curriculum planner. You have only YouTube titles and short descriptions, NOT transcripts. Suggest useful chapter groupings and learning objectives. Return ONLY JSON {description:string,modules:[{title:string,video_ids:string[]}]}. Use provided IDs exactly once each. Do not invent IDs or facts about actual video content."},
     {role:"user",content:JSON.stringify({playlist:job.playlist_title,videos:input})},
   ],1700);
   const clean=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
   const output=JSON.parse(clean) as {description?:unknown;modules?:{title?:unknown;video_ids?:unknown}[]};
   const valid=new Set(data.map(x=>x.id));
   const found=new Set<string>();
   const modules=(output.modules??[]).slice(0,20).map(m=>({
     title:String(m.title??"Course chapter").slice(0,180),
     ids:Array.isArray(m.video_ids)?m.video_ids.filter((id):id is string=>
       typeof id==="string"&&valid.has(id)&&!found.has(id)&&!!found.add(id)):[],
   })).filter(m=>m.ids.length);
   // Never silently omit videos because AI output was partial.
   const missing=data.map(x=>x.id).filter(id=>!found.has(id));
   if(missing.length)modules.push({title:"Other lectures",ids:missing});
   if(!modules.length)throw new Error("No valid AI chapters");
   return NextResponse.json({
     description:typeof output.description==="string"?output.description.slice(0,10000):"",
     modules,limited:data.length===60,
     disclaimer:"Suggestions are based only on publicly available titles and descriptions, not video transcripts.",
   });
 }catch(error){
   if(error instanceof OpenRouterError)
     return NextResponse.json({error:error.message},{status:error.status});
   return NextResponse.json({error:"AI grouping was unavailable. Choose sequential or rule-based grouping instead."},{status:502});
 }
}
