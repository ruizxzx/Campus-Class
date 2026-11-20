import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";
export const runtime="nodejs";
const uuid=z.string().uuid();
const item=z.object({id:uuid,path:z.string().min(15).max(500),
  name:z.string().min(1).max(255),size:z.number().int().min(1).max(20*1024*1024),
  title:z.string().trim().min(2).max(180),outline:z.string().max(50000)}).strict();
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("prepare"),class_id:uuid,
   title:z.string().trim().min(2).max(180),outline:z.string().max(50000),
   files:z.array(z.object({name:z.string().min(1).max(255),
     size:z.number().int().min(1).max(20*1024*1024)}).strict()).min(1).max(10)}).strict(),
 z.object({action:z.literal("publish"),class_id:uuid,items:z.array(item).min(1).max(10)}).strict(),
]);
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role==="student")
   return NextResponse.json({error:"Only staff can upload syllabi."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid syllabus PDF batch."},{status:400});
 const body=parsed.data;let cls;
 try{cls=await libraryClassAccess(actor,body.class_id,true);}
 catch{return NextResponse.json({error:"Could not verify faculty assignment."},{status:503});}
 if(!cls)return NextResponse.json({error:"Not assigned to this classroom."},{status:403});
 const db=createAdminClient();
 if(body.action==="prepare"){
   const files=[];
   for(const file of body.files){
     if(!file.name.toLowerCase().endsWith(".pdf"))
       return NextResponse.json({error:"Syllabi must be PDF files."},{status:400});
     const id=randomUUID(),safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-170);
     const path=[actor.profile.college_id,cls.id,id+"-"+safe].join("/");
     const {data,error}=await db.storage.from("class-syllabi").createSignedUploadUrl(path);
     if(error||!data?.token)return NextResponse.json({error:"Could not authorize this private syllabus upload."},{status:503});
     files.push({id,path,token:data.token,name:file.name,size:file.size,
       title:body.files.length===1?body.title:(body.title+" – "+file.name.replace(/\.pdf$/i,"")).slice(0,180),
       outline:body.outline});
   }
   return NextResponse.json({items:files});
 }
 // First validate ALL files. A single multi-row upsert is one SQL statement
 // and therefore all-or-nothing even if the batch is retried.
 if(new Set(body.items.map(file=>file.id)).size!==body.items.length)
   return NextResponse.json({error:"A PDF appears more than once."},{status:400});
 const rows:{id:string;college_id:string;class_id:string;created_by:string;title:string;
  file_name:string;file_size:number;storage_path:string;outline_text:string}[]=[];
 for(const file of body.items){
   if(!file.path.startsWith(actor.profile.college_id+"/"+cls.id+"/"+file.id+"-")
     ||!file.name.toLowerCase().endsWith(".pdf"))
     return NextResponse.json({error:"Invalid signed PDF file path."},{status:403});
   const {data:info,error:infoError}=await db.storage.from("class-syllabi").info(file.path);
   const obj=info as unknown as {size?:number;metadata?:{size?:number}}|null;
   if(infoError||Number(obj?.size??obj?.metadata?.size??0)!==file.size)
     return NextResponse.json({error:"A PDF is missing or incomplete. No new PDF metadata was published."},{status:409});
   rows.push({
     id:file.id,college_id:actor.profile.college_id,class_id:cls.id,
     created_by:actor.userId,title:file.title,file_name:file.name,
     file_size:file.size,storage_path:file.path,outline_text:file.outline,
   });
 }
 const {error:insertError}=await db.from("class_syllabi")
   .upsert(rows,{onConflict:"id",ignoreDuplicates:true});
 if(insertError){
   console.error("Atomic syllabus batch failed",{code:insertError.code});
   return NextResponse.json({error:"Could not publish the PDF batch. No new records were committed."},{status:503});
 }
 return NextResponse.json({success:true,count:body.items.length});
}
