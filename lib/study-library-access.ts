import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";
export type LibraryActor={profile:Profile;userId:string};

/** Every privileged query must be preceded by explicit class-role checks. */
export async function libraryClassAccess(actor:LibraryActor,classId:string,write=false){
 const db=createAdminClient();
 const {data:cls,error}=await db.from("classes").select("id,college_id,subject_id,semester,is_active")
  .eq("id",classId).eq("college_id",actor.profile.college_id).maybeSingle();
 if(error)throw new Error("Could not verify the library class.");
 if(!cls||!cls.is_active)return null;
 if(actor.profile.role==="admin")return cls;
 if(actor.profile.role==="faculty"){
   const {data,error:permissionError}=await db.from("class_faculty").select("class_id")
    .eq("college_id",actor.profile.college_id).eq("class_id",classId)
    .eq("faculty_id",actor.userId).maybeSingle();
   if(permissionError)throw new Error("Could not verify faculty class assignment.");
   return permissionError||!data?null:cls;
 }
 if(write)return null;
 const {data:enrollment,error:enrollmentError}=await db.from("class_enrollments")
  .select("id").eq("college_id",actor.profile.college_id)
  .eq("class_id",classId).eq("student_id",actor.userId)
  .eq("status","active").maybeSingle();
 if(enrollmentError)throw new Error("Could not verify student class enrollment.");
 return enrollment?cls:null;
}
export async function accessibleLibraryClasses(actor:LibraryActor){
 const db=createAdminClient();
 if(actor.profile.role==="admin"){
   const {data,error}=await db.from("classes").select("id,display_name,section,subject_id,semester,subjects(name,code)")
     .eq("college_id",actor.profile.college_id).eq("is_active",true).order("display_name");
   if(error)throw new Error("Could not load college classes.");
   return data??[];
 }
 const source=actor.profile.role==="faculty"?"class_faculty":"class_enrollments";
 let query=db.from(source).select("class_id").eq("college_id",actor.profile.college_id);
 query=actor.profile.role==="faculty"?query.eq("faculty_id",actor.userId):
   query.eq("student_id",actor.userId).eq("status","active");
 const {data:relations,error:relationError}=await query;
 if(relationError)throw new Error("Could not load your class memberships.");
 const ids=[...new Set((relations??[]).map(x=>x.class_id))];
 if(!ids.length)return [];
 const {data,error}=await db.from("classes")
   .select("id,display_name,section,subject_id,semester,subjects(name,code)").eq("college_id",actor.profile.college_id)
   .eq("is_active",true).in("id",ids).order("display_name");
 if(error)throw new Error("Could not load accessible classrooms.");
 return data??[];
}
