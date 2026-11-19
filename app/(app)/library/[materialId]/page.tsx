import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { libraryClassAccess } from "@/lib/study-library-access";
import { StudyLibraryReader } from "@/components/study-library-reader";
import { PageHeader } from "@/components/ui";
export const dynamic="force-dynamic";
export default async function LibraryMaterialPage({params}:{
 params:Promise<{materialId:string}>;
}){
 const {materialId}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(materialId))notFound();
 const profile=await requireProfile(),db=createAdminClient();
 const {data:material,error}=await db.from("study_materials")
  .select("id,title,description,class_id,semester,unit_title,chapter_title,current_version,status")
  .eq("id",materialId).eq("college_id",profile.college_id).maybeSingle();
 if(error||!material)notFound();
 let access;
 try{access=await libraryClassAccess({profile,userId:profile.id},material.class_id);}
 catch{throw new Error("Could not check class access.");}
 if(!access)notFound();
 const isStaff=profile.role!=="student";
 if(material.status!=="published"&&!isStaff)notFound();
 const {data:versions,error:versionError}=await db.from("study_material_versions")
  .select("id,version,file_name,mime_type,indexed_at,created_at")
  .eq("college_id",profile.college_id).eq("material_id",material.id)
  .order("version",{ascending:false});
 if(versionError)throw new Error("Could not load file version history.");
 const version=(versions??[]).find(v=>v.version===material.current_version);
 if(!version)notFound();
 const [progressResult,bookmarksResult]=profile.role==="student"
  ?await Promise.all([
    db.from("study_material_progress").select("last_page,status")
      .eq("college_id",profile.college_id).eq("student_id",profile.id)
      .eq("material_id",material.id).maybeSingle(),
    db.from("study_material_bookmarks").select("page_number,note")
      .eq("college_id",profile.college_id).eq("student_id",profile.id)
      .eq("material_id",material.id).order("page_number"),
  ]):[{data:null,error:null},{data:[],error:null}];
 if(progressResult.error||bookmarksResult.error)throw new Error("Could not load reading progress.");
 return <>
   <nav className="mb-4"><Link href="/library" className="btn-secondary">Back to digital library</Link></nav>
   <PageHeader title={material.title} description={[
     "College learning library",material.semester?"Semester "+material.semester:"",
     material.unit_title,material.chapter_title].filter(Boolean).join(" · ")}/>
   {material.description?<p className="surface p-4 mb-4 text-sm leading-6">{material.description}</p>:null}
   {material.status!=="published"?<p className="surface p-4 mb-4 text-sm text-[var(--muted)]">
     This is an unpublished draft. Students cannot access it until its upload is completed.</p>:null}
   <StudyLibraryReader materialId={material.id}
     version={{id:version.id,file_name:version.file_name,mime_type:version.mime_type,indexed_at:version.indexed_at}}
     isStaff={isStaff} versions={isStaff?versions??[]:[]}
     initialPage={progressResult.data?.last_page??1}
     initialCompleted={progressResult.data?.status==="completed"}
     initialBookmarks={bookmarksResult.data??[]}/>
 </>;
}
