import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("start"),lesson_id:z.string().uuid()}).strict(),
 z.object({action:z.literal("heartbeat"),session_id:z.string().uuid(),
   position:z.number().finite().min(0).max(864000),
   state:z.number().int().min(0).max(5),
   rate:z.number().finite().min(0.25).max(2)}).strict(),
]);
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 if(actor.profile.role!=="student")return NextResponse.json({error:"Video progress belongs to enrolled students."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid playback progress report."},{status:400});
 const db=createAdminClient(),college=actor.profile.college_id,body=parsed.data;
 if(body.action==="heartbeat"){
   const {data,error}=await db.rpc("record_youtube_watch",{
     p_session:body.session_id,p_college:college,p_student:actor.userId,
     p_position:body.position,p_state:body.state,p_rate:body.rate,
   });
   if(error){
     console.error("YouTube watch RPC rejected",{code:error.code});
     return NextResponse.json({error:error.code==="42501"?
       "Playback session expired or you are no longer enrolled.":
       "Could not save watched video progress. Verify migration 047.",retryable:error.code!=="42501"},{status:error.code==="42501"?403:503});
   }
   return NextResponse.json(data);
 }
 const {data:source,error:sourceError}=await db.from("youtube_lesson_sources")
   .select("lesson_id,course_id,duration_seconds,course_lessons!inner(is_published),courses!inner(subject_id,status)")
   .eq("college_id",college).eq("lesson_id",body.lesson_id).maybeSingle();
 if(sourceError)return NextResponse.json({error:"Could not check this video lesson."},{status:503});
 const lesson=Array.isArray(source?.course_lessons)?source?.course_lessons[0]:source?.course_lessons;
 const course=Array.isArray(source?.courses)?source?.courses[0]:source?.courses;
 if(!source||!lesson?.is_published||course?.status!=="active")
   return NextResponse.json({error:"This video is not available in an active published course."},{status:404});
 const {data:cls,error:classError}=await db.from("classes")
   .select("id").eq("college_id",college).eq("subject_id",course.subject_id).eq("is_active",true);
 if(classError)return NextResponse.json({error:"Could not check course enrollment."},{status:503});
 if(!cls?.length)return NextResponse.json({error:"Join an active class for this subject first."},{status:403});
 const {data:membership,error:membershipError}=await db.from("class_enrollments")
   .select("id").eq("college_id",college).eq("student_id",actor.userId).eq("status","active")
   .in("class_id",cls.map(x=>x.id)).limit(1);
 if(membershipError)return NextResponse.json({error:"Could not check enrollment."},{status:503});
 if(!membership?.length)return NextResponse.json({error:"Not enrolled in this course subject."},{status:403});
 const {data:progress,error:progressError}=await db.from("youtube_watch_progress")
   .select("position_seconds,percent,completed_at,watched_seconds")
   .eq("college_id",college).eq("student_id",actor.userId)
   .eq("lesson_id",body.lesson_id).maybeSingle();
 if(progressError)return NextResponse.json({error:"Could not load your video resume position."},{status:503});
 const position=Math.max(0,Math.min(source.duration_seconds-1,progress?.position_seconds??0));
 const {data:session,error:sessionError}=await db.from("youtube_watch_sessions").insert({
   college_id:college,student_id:actor.userId,lesson_id:body.lesson_id,
   last_position:position,last_state:2,last_rate:1,
 }).select("id").single();
 if(sessionError||!session)return NextResponse.json({error:"Could not open a safe playback session. Apply SQL 045."},{status:503});
 return NextResponse.json({
   session_id:session.id,resume:position,
   percent:Number(progress?.percent??0),
   watched_seconds:progress?.watched_seconds??0,
   duration_seconds:source.duration_seconds,
   completed:Boolean(progress?.completed_at),
 });
}
