import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorizedImport } from "@/lib/youtube-access";
export const runtime="nodejs";
const schema=z.object({items:z.array(z.object({
 id:z.string().uuid(),title:z.string().trim().min(2).max(180),
 description:z.string().max(20000),selected:z.boolean(),
}).strict()).min(1).max(100)}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const {id}=await params;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid draft lecture selections."},{status:400});
 let job;
 try{job=await loadAuthorizedImport(actor.profile,id);}
 catch{return NextResponse.json({error:"Could not authorize this import."},{status:503});}
 if(!job||job.status!=="review")return NextResponse.json({error:"This import is not editable."},{status:409});
 if(new Set(parsed.data.items.map(i=>i.id)).size!==parsed.data.items.length)
   return NextResponse.json({error:"A lecture was repeated in the draft."},{status:400});
 const db=createAdminClient();
 const ids=parsed.data.items.map(x=>x.id);
 const {data:existing,error:lookupError}=await db.from("youtube_import_items")
   .select("id,availability").eq("college_id",actor.profile.college_id)
   .eq("job_id",id).in("id",ids);
 if(lookupError||existing?.length!==ids.length)return NextResponse.json({error:"Some lectures are no longer in the import."},{status:409});
 if(existing.some(x=>x.availability!=="available"&&parsed.data.items.find(y=>y.id===x.id)?.selected))
   return NextResponse.json({error:"Unavailable lectures cannot be selected."},{status:409});
 for(const item of parsed.data.items){
   const {error}=await db.from("youtube_import_items").update({
     title:item.title,description:item.description,selected:item.selected,
   }).eq("college_id",actor.profile.college_id).eq("job_id",id).eq("id",item.id);
   if(error)return NextResponse.json({error:"Could not save all lecture edits; retry safely."},{status:503});
 }
 return NextResponse.json({success:true,count:parsed.data.items.length});
}
