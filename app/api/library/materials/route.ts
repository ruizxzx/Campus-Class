import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";
import { getAttachmentMimeType } from "@/lib/upload-validation";

export const runtime="nodejs";
const uuid=z.string().uuid();
const fileSchema=z.object({
  name:z.string().min(1).max(255),
  size:z.number().int().min(1).max(30*1024*1024),
  type:z.string().min(1).max(160),
}).strict();
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),class_id:uuid,
    title:z.string().max(180).default(""),
    description:z.string().max(4000).default(""),
    unit_title:z.string().max(120).default(""),
    chapter_title:z.string().max(120).default(""),
    semester:z.number().int().min(1).max(12).nullable().optional(),
    files:z.array(fileSchema).min(1).max(10)}).strict(),
  z.object({action:z.literal("replace"),material_id:uuid,file:fileSchema}).strict(),
  z.object({action:z.literal("publish"),items:z.array(
    z.object({material_id:uuid,version_id:uuid}).strict()).min(1).max(10)}).strict(),
  z.object({action:z.literal("restore"),material_id:uuid,version_id:uuid}).strict(),
]);
function fileIsValid(file:z.infer<typeof fileSchema>){
  const extension=file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return getAttachmentMimeType(extension)===file.type ||
    (extension===".txt"&&file.type==="text/plain");
}
function filePath(college:string,classId:string,materialId:string,versionId:string,name:string){
  const safe=name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-110);
  return [college,classId,materialId,versionId,randomUUID()+"-"+safe].join("/");
}
async function verifyPresent(path:string,expectedSize:number){
  const db=createAdminClient();
  const {data,error}=await db.storage.from("study-library").info(path);
  if(error||!data)return false;
  const info=data as unknown as {size?:number;metadata?:{size?:number}};
  const size=Number(info.size??info.metadata?.size??0);
  return size===expectedSize;
}
export async function POST(request:Request){
  const actor=await requestProfile();
  if(isResponse(actor))return actor;
  if(actor.profile.role!=="admin"&&actor.profile.role!=="faculty")
    return NextResponse.json({error:"Only faculty or college admins can manage library files."},{status:403});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid library request."},{status:400});
  const body=parsed.data;
  const db=createAdminClient();
  const college=actor.profile.college_id;
  try{
    if(body.action==="create"){
      const cls=await libraryClassAccess(actor,body.class_id,true);
      if(!cls)return NextResponse.json({error:"You are not assigned to this class."},{status:403});
      if(body.files.some(file=>!fileIsValid(file)))
        return NextResponse.json({error:"Only PDF, DOCX, PPTX, TXT or image files up to 30 MB are allowed."},{status:400});
      const created:{material_id:string;version_id:string;path:string;token:string;name:string}[]=[];
      for(const file of body.files){
        const stem=file.name.replace(/\.[^.]+$/,"").slice(0,140);
        const title=body.title.trim()?
          (body.files.length===1?body.title.trim():body.title.trim()+" – "+stem).slice(0,180):stem.slice(0,180);
        const {data:material,error:insertError}=await db.from("study_materials").insert({
          college_id:college,class_id:cls.id,subject_id:cls.subject_id,
          title:title.length>=2?title:"Study material",
          description:body.description,semester:body.semester??cls.semester,
          unit_title:body.unit_title,chapter_title:body.chapter_title,
          created_by:actor.userId,status:"draft",current_version:1,
        }).select("id").single();
        if(insertError||!material){
          console.error("Library material creation failed",{code:insertError?.code});
          return NextResponse.json({error:"Could not start uploading all materials. No incomplete drafts are visible to students."},{status:503});
        }
        const versionId=randomUUID();
        const path=filePath(college,cls.id,material.id,versionId,file.name);
        const {error:versionError}=await db.from("study_material_versions").insert({
          id:versionId,college_id:college,material_id:material.id,version:1,
          file_name:file.name,file_size:file.size,mime_type:file.type,
          storage_path:path,created_by:actor.userId,
        });
        if(versionError){
          console.error("Library version creation failed",{code:versionError.code});
          return NextResponse.json({error:"Could not prepare an upload; retry safely."},{status:503});
        }
        const {data:signed,error:signError}=await db.storage.from("study-library")
          .createSignedUploadUrl(path);
        if(signError||!signed?.token){
          console.error("Library upload signing failed",{code:signError?.statusCode});
          return NextResponse.json({error:"Could not authorize a private upload. Apply SQL 041 and retry."},{status:503});
        }
        created.push({material_id:material.id,version_id:versionId,path,token:signed.token,name:file.name});
      }
      return NextResponse.json({items:created});
    }
    if(body.action==="replace"||body.action==="restore"){
      const {data:material,error}=await db.from("study_materials")
        .select("id,college_id,class_id,current_version,status")
        .eq("id",body.material_id).eq("college_id",college).maybeSingle();
      if(error)return NextResponse.json({error:"Could not read this material."},{status:503});
      if(!material)return NextResponse.json({error:"Material not found."},{status:404});
      if(!await libraryClassAccess(actor,material.class_id,true))
        return NextResponse.json({error:"You do not manage this class."},{status:403});
      if(body.action==="restore"){
        const {data:version,error:versionError}=await db.from("study_material_versions")
          .select("id,version,storage_path,file_size").eq("college_id",college)
          .eq("material_id",material.id).eq("id",body.version_id).maybeSingle();
        if(versionError||!version)return NextResponse.json({error:"File version not found."},{status:404});
        if(!await verifyPresent(version.storage_path,version.file_size))
          return NextResponse.json({error:"That version's private file is missing."},{status:409});
        const {error:updateError}=await db.from("study_materials")
          .update({current_version:version.version,updated_at:new Date().toISOString()})
          .eq("id",material.id).eq("college_id",college);
        if(updateError)return NextResponse.json({error:"Could not restore the file version."},{status:503});
        return NextResponse.json({success:true});
      }
      if(!fileIsValid(body.file))return NextResponse.json({error:"Unsupported document type."},{status:400});
      const {data:versions,error:versionError}=await db.from("study_material_versions")
        .select("version").eq("college_id",college).eq("material_id",material.id)
        .order("version",{ascending:false}).limit(1);
      if(versionError)return NextResponse.json({error:"Could not check version history."},{status:503});
      const number=(versions?.[0]?.version??0)+1;
      const versionId=randomUUID();
      const path=filePath(college,material.class_id,material.id,versionId,body.file.name);
      const {error:newError}=await db.from("study_material_versions").insert({
        id:versionId,college_id:college,material_id:material.id,version:number,
        file_name:body.file.name,file_size:body.file.size,mime_type:body.file.type,
        storage_path:path,created_by:actor.userId,
      });
      if(newError)return NextResponse.json({error:"Could not prepare the new version. Retry."},{status:newError.code==="23505"?409:503});
      const {data:signed,error:signError}=await db.storage.from("study-library").createSignedUploadUrl(path);
      if(signError||!signed?.token)return NextResponse.json({error:"Could not sign the upload. SQL 041 may be missing."},{status:503});
      return NextResponse.json({items:[{material_id:material.id,version_id:versionId,path,token:signed.token,name:body.file.name}]});
    }
    // Activate only versions that were actually uploaded to private Storage.
    for(const item of body.items){
      const {data:material,error:materialError}=await db.from("study_materials")
        .select("id,class_id").eq("id",item.material_id).eq("college_id",college).maybeSingle();
      if(materialError||!material)return NextResponse.json({error:"Could not verify library material."},{status:503});
      if(!await libraryClassAccess(actor,material.class_id,true))
        return NextResponse.json({error:"No permission to publish these materials."},{status:403});
      const {data:version,error:versionError}=await db.from("study_material_versions")
        .select("id,version,storage_path,file_size").eq("college_id",college)
        .eq("material_id",item.material_id).eq("id",item.version_id).maybeSingle();
      if(versionError||!version)return NextResponse.json({error:"File version not found."},{status:404});
      if(!await verifyPresent(version.storage_path,version.file_size))
        return NextResponse.json({error:"An upload is incomplete or has a different file size. Retry the missing file before publishing."},{status:409});
      const {error:updateError}=await db.from("study_materials").update({
        status:"published",current_version:version.version,updated_at:new Date().toISOString(),
      }).eq("id",material.id).eq("college_id",college);
      if(updateError)return NextResponse.json({error:"Could not publish an uploaded material. Retry publication."},{status:503});
    }
    return NextResponse.json({success:true,published:body.items.length});
  }catch(error){
    console.error("Library material operation failed",{reason:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({error:"Library operation failed. Verify SQL 041 and your class access."},{status:503});
  }
}
