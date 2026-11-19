import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";

export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const url=new URL(request.url);
 const materialId=url.searchParams.get("material_id")??"";
 const versionId=url.searchParams.get("version_id");
 const mode=url.searchParams.get("mode")==="download"?"download":"preview";
 if(!/^[0-9a-f-]{36}$/i.test(materialId)||versionId&&!/^[0-9a-f-]{36}$/i.test(versionId))
   return NextResponse.json({error:"Invalid material or version."},{status:400});
 const db=createAdminClient();
 const {data:material,error}=await db.from("study_materials")
   .select("id,class_id,current_version,status").eq("id",materialId)
   .eq("college_id",actor.profile.college_id).maybeSingle();
 if(error)return NextResponse.json({error:"Could not read this material."},{status:503});
 if(!material)return NextResponse.json({error:"Study material not found."},{status:404});
 let allowed;
 try{allowed=await libraryClassAccess(actor,material.class_id);}
 catch{return NextResponse.json({error:"Could not verify your class access."},{status:503});}
 if(!allowed)return NextResponse.json({error:"This material is outside your classes."},{status:403});
 const staff=actor.profile.role!=="student";
 if(material.status!=="published"&&!staff)return NextResponse.json({error:"Material is not published."},{status:404});
 if(versionId&&!staff)return NextResponse.json({error:"Previous versions are available to faculty only."},{status:403});
 let query=db.from("study_material_versions").select("id,storage_path,file_name,mime_type")
   .eq("college_id",actor.profile.college_id).eq("material_id",materialId);
 query=versionId?query.eq("id",versionId):query.eq("version",material.current_version);
 const {data:version,error:versionError}=await query.maybeSingle();
 if(versionError||!version)return NextResponse.json({error:"File version not available."},{status:404});
 if(mode==="preview"&&version.mime_type!=="application/pdf")
   return NextResponse.json({error:"In-browser preview supports PDFs only. Download this file instead."},{status:400});
 const {data:signed,error:signError}=await db.storage.from("study-library")
   .createSignedUrl(version.storage_path,180,
     mode==="download"?{download:version.file_name}:undefined);
 if(signError||!signed?.signedUrl)
   return NextResponse.json({error:"Could not authorize a private file link."},{status:503});
 const response=NextResponse.redirect(signed.signedUrl,302);
 response.headers.set("Cache-Control","no-store, private");
 return response;
}
