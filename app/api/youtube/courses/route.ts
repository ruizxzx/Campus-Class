import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export async function GET(){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role==="student")return NextResponse.json({courses:[]});
 const db=createAdminClient(),college=actor.profile.college_id;
 const {data:classes,error:classError}=await db.from("classes")
   .select("id,subject_id").eq("college_id",college).eq("is_active",true);
 if(classError)return NextResponse.json({error:"Could not load faculty subjects."},{status:503});
 let allowed=classes??[];
 if(actor.profile.role==="faculty"){
   const {data:assigned,error}=await db.from("class_faculty").select("class_id")
     .eq("college_id",college).eq("faculty_id",actor.userId);
   if(error)return NextResponse.json({error:"Could not verify faculty classroom assignments."},{status:503});
   const ids=new Set((assigned??[]).map(a=>a.class_id));
   allowed=allowed.filter(cls=>ids.has(cls.id));
 }
 const subjectIds=[...new Set(allowed.map(cls=>cls.subject_id))];
 if(!subjectIds.length)return NextResponse.json({courses:[]});
 const {data,error}=await db.from("courses")
   .select("id,title,subject_id,status").eq("college_id",college)
   .in("subject_id",subjectIds).order("updated_at",{ascending:false}).limit(200);
 if(error)return NextResponse.json({error:"Could not load eligible courses."},{status:503});
 const ids=(data??[]).map(c=>c.id);
 const {data:sources,error:sourceError}=ids.length?await db.from("youtube_playlist_sources")
   .select("id,course_id,playlist_id,title,sync_enabled,automatic_additions,last_checked_at")
   .eq("college_id",college).in("course_id",ids).order("created_at",{ascending:false})
   :{data:[],error:null};
 if(sourceError)return NextResponse.json({error:"Could not load connected YouTube playlists."},{status:503});
 const classIds=allowed.map(cls=>cls.id);
 const [quizResult,assignmentResult]=await Promise.all([
   db.from("quizzes").select("id,title,class_id").eq("college_id",college)
     .eq("status","published").in("class_id",classIds).limit(200),
   db.from("assignments").select("id,title,class_id").eq("college_id",college)
     .eq("status","published").in("class_id",classIds).limit(200),
 ]);
 if(quizResult.error||assignmentResult.error)
   return NextResponse.json({error:"Could not load linked quiz and assignment requirements."},{status:503});
 const subjectsByClass=new Map(allowed.map(cls=>[cls.id,cls.subject_id]));
 return NextResponse.json({courses:data??[],sources:sources??[],
   quizzes:(quizResult.data??[]).map(q=>({...q,subject_id:subjectsByClass.get(q.class_id)})),
   assignments:(assignmentResult.data??[]).map(a=>({...a,subject_id:subjectsByClass.get(a.class_id)})),
 });
}
