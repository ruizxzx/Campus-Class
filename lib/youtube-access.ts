import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";
export async function canManageYoutubeSubject(profile:Profile,subjectId:string,courseId?:string|null){
 const db=createAdminClient();
 const college=profile.college_id;
 const {data:subject,error}=await db.from("subjects").select("id").eq("college_id",college)
   .eq("id",subjectId).eq("is_active",true).maybeSingle();
 if(error)throw new Error("Could not verify subject.");
 if(!subject)return false;
 if(courseId){
   const {data:course,error:courseError}=await db.from("courses")
     .select("id").eq("id",courseId).eq("college_id",college).eq("subject_id",subjectId).maybeSingle();
   if(courseError)throw new Error("Could not verify the destination course.");
   if(!course)return false;
 }
 if(profile.role==="admin")return true;
 if(profile.role!=="faculty")return false;
 const {data:assigned,error:assignmentError}=await db.from("class_faculty")
   .select("class_id,classes!inner(subject_id,is_active)")
   .eq("college_id",college).eq("faculty_id",profile.id)
   .eq("classes.subject_id",subjectId).eq("classes.is_active",true).limit(1);
 if(assignmentError)throw new Error("Could not verify assigned faculty classes.");
 return Boolean(assigned?.length);
}
export async function loadAuthorizedImport(profile:Profile,id:string){
 const db=createAdminClient();
 const {data,error}=await db.from("youtube_import_jobs").select("*").eq("id",id)
   .eq("college_id",profile.college_id).eq("created_by",profile.id).maybeSingle();
 if(error)throw new Error("Could not load the playlist import job.");
 if(!data)return null;
 if(!await canManageYoutubeSubject(profile,data.subject_id,data.target_course_id))return null;
 return data;
}
