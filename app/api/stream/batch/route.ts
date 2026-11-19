import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { streamPostSchema } from "@/lib/validators";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";
import { getAttachmentMimeType } from "@/lib/upload-validation";
export const runtime="nodejs";

const uuid=z.string().uuid();
const fileSchema=z.object({name:z.string().min(1).max(255),
  size:z.number().int().min(1).max(30*1024*1024),type:z.string().min(1).max(160)}).strict();
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("begin"),post:z.unknown(),files:z.array(fileSchema).max(10)}).strict(),
  z.object({action:z.literal("finish"),post_id:uuid}).strict(),
]);
export async function POST(request:Request){
 const actor=await requestProfile();
 if(isResponse(actor))return actor;
 if(actor.profile.role!=="faculty"&&actor.profile.role!=="admin")
   return NextResponse.json({error:"Only staff can publish class materials."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid stream upload request."},{status:400});
 const db=createAdminClient();const college=actor.profile.college_id;
 const body=parsed.data;
 if(body.action==="begin"){
   const post=streamPostSchema.safeParse(body.post);
   if(!post.success)return NextResponse.json({error:"Review the class post details and recipients."},{status:400});
   let cls;
   try {cls=await libraryClassAccess(actor,post.data.class_id,true);}
   catch{return NextResponse.json({error:"Could not verify class access."},{status:503});}
   if(!cls)return NextResponse.json({error:"You do not manage this class."},{status:403});
   for(const file of body.files){
     const extension=file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
     if(getAttachmentMimeType(extension)!==file.type)
       return NextResponse.json({error:"Only PDF, DOCX, PPTX or supported image files up to 30 MB are allowed."},{status:400});
   }
   if(post.data.visibility==="selected_students"){
     if(!post.data.student_ids.length)return NextResponse.json({error:"Choose at least one student."},{status:400});
     const {data:enrolled,error}=await db.from("class_enrollments").select("student_id")
       .eq("college_id",college).eq("class_id",cls.id).eq("status","active")
       .in("student_id",post.data.student_ids);
     if(error)return NextResponse.json({error:"Could not check selected students."},{status:503});
     const ids=new Set((enrolled??[]).map(s=>s.student_id));
     if(post.data.student_ids.some(id=>!ids.has(id)))
       return NextResponse.json({error:"One or more selected students are not enrolled in this class."},{status:403});
   }
   const {data:created,error:createError}=await db.from("class_stream_posts").insert({
     college_id:college,class_id:cls.id,author_id:actor.userId,
     title:post.data.title,body:post.data.body,post_type:post.data.post_type,
     visibility:post.data.visibility,pinned_at:post.data.pinned?new Date().toISOString():null,
     published_at:null,
   }).select("id").single();
   if(createError||!created)return NextResponse.json({error:"Could not create the private stream draft."},{status:503});
   if(post.data.student_ids.length){
     const {error}=await db.from("stream_targets").insert(post.data.student_ids.map(id=>({
       college_id:college,post_id:created.id,student_id:id,
     })));
     if(error){
       await db.from("class_stream_posts").delete().eq("id",created.id);
       return NextResponse.json({error:"Could not save private recipients."},{status:503});
     }
   }
   const files:{path:string;token:string;name:string}[]=[];
   for(const file of body.files){
     const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-115);
     const path=[college,cls.id,created.id,randomUUID()+"-"+safe].join("/");
     const {error:metaError}=await db.from("stream_attachments").insert({
       college_id:college,post_id:created.id,file_name:file.name,
       storage_path:path,mime_type:file.type,file_size:file.size,
     });
     if(metaError){
       console.error("Stream batch metadata failed",{code:metaError.code});
       return NextResponse.json({error:"Could not prepare every resource. Draft remains unpublished."},{status:503});
     }
     const {data:signed,error:signError}=await db.storage.from("class-stream").createSignedUploadUrl(path);
     if(signError||!signed?.token)return NextResponse.json({
       error:"Could not authorize direct upload. Check Storage permissions and SQL 038.",
     },{status:503});
     files.push({path,token:signed.token,name:file.name});
   }
   return NextResponse.json({post_id:created.id,files});
 }
 const {data:post,error:postError}=await db.from("class_stream_posts")
   .select("id,class_id,author_id,published_at").eq("college_id",college).eq("id",body.post_id).maybeSingle();
 if(postError)return NextResponse.json({error:"Could not verify stream draft."},{status:503});
 if(!post)return NextResponse.json({error:"Post not found."},{status:404});
 if(post.author_id!==actor.userId&&actor.profile.role!=="admin")
   return NextResponse.json({error:"You did not create this draft."},{status:403});
 if(post.published_at)return NextResponse.json({success:true,id:post.id});
 try{
   if(!await libraryClassAccess(actor,post.class_id,true))
     return NextResponse.json({error:"You are no longer assigned to this class."},{status:403});
 }catch{return NextResponse.json({error:"Could not verify your class assignment."},{status:503});}
 const {data:files,error:fileError}=await db.from("stream_attachments")
   .select("id,storage_path,file_size").eq("college_id",college).eq("post_id",post.id);
 if(fileError)return NextResponse.json({error:"Could not check uploaded resources."},{status:503});
 for(const file of files??[]){
   const {data:info,error}=await db.storage.from("class-stream").info(file.storage_path);
   const metadata=info as unknown as {size?:number;metadata?:{size?:number}}|null;
   const size=Number(metadata?.size??metadata?.metadata?.size??0);
   if(error||size!==Number(file.file_size))
     return NextResponse.json({error:"Some attachments are missing or incomplete. Please retry the upload before publishing."},{status:409});
 }
 const {data:published,error:publishError}=await db.from("class_stream_posts")
   .update({published_at:new Date().toISOString()}).eq("college_id",college)
   .eq("id",post.id).is("published_at",null).select("id").maybeSingle();
 if(publishError)return NextResponse.json({error:"Could not publish the completed post. Retry finalization."},{status:503});
 return NextResponse.json({success:true,id:published?.id??post.id});
}
