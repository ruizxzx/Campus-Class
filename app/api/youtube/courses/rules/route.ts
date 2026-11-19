import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageYoutubeSubject } from "@/lib/youtube-access";
export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("publish"),course_id:z.string().uuid()}).strict(),
 z.object({action:z.literal("requirements"),course_id:z.string().uuid(),
   threshold:z.number().int().min(60).max(100).default(90),
   quiz_id:z.string().uuid().nullable(),assignment_id:z.string().uuid().nullable(),
   min_quiz_percent:z.number().int().min(0).max(100).default(50),
   min_assignment_percent:z.number().int().min(0).max(100).default(50),
   faculty_approval_required:z.boolean().default(false)}).strict(),
 z.object({action:z.literal("approve"),course_id:z.string().uuid(),
   student_id:z.string().uuid()}).strict(),
 z.object({action:z.literal("certificate"),course_id:z.string().uuid()}).strict(),
]);
export async function POST(request:Request){
 const actor=await requestProfile();if(isResponse(actor))return actor;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid course action."},{status:400});
 const body=parsed.data,db=createAdminClient(),college=actor.profile.college_id;
 const {data:course,error:courseError}=await db.from("courses")
   .select("id,subject_id,status").eq("college_id",college).eq("id",body.course_id).maybeSingle();
 if(courseError||!course)return NextResponse.json({error:"Course not found."},{status:404});
 if(body.action==="certificate"){
   if(actor.profile.role!=="student")return NextResponse.json({error:"Only students can request their own certificate recheck."},{status:403});
   const {data:eligible,error:membershipError}=await db.from("classes")
     .select("id").eq("college_id",college).eq("subject_id",course.subject_id).eq("is_active",true);
   if(membershipError)return NextResponse.json({error:"Could not verify enrollment."},{status:503});
   if(!eligible?.length)return NextResponse.json({error:"Not enrolled in this course."},{status:403});
   const {data:enrolled,error}=await db.from("class_enrollments").select("id")
     .eq("college_id",college).eq("student_id",actor.userId)
     .eq("status","active").in("class_id",eligible.map(x=>x.id)).limit(1);
   if(error||!enrolled?.length)return NextResponse.json({error:"Not enrolled in this course."},{status:403});
   const result=await db.rpc("recheck_youtube_certificate",{
     p_college:college,p_student:actor.userId,p_course:course.id});
   if(result.error)return NextResponse.json({error:"Could not verify course completion requirements."},{status:503});
   return NextResponse.json({eligible:Boolean(result.data)});
 }
 if(actor.profile.role==="student")return NextResponse.json({error:"Only faculty may change course rules."},{status:403});
 try{if(!await canManageYoutubeSubject(actor.profile,course.subject_id,course.id))
   return NextResponse.json({error:"Not assigned to this course's subject."},{status:403});}
 catch{return NextResponse.json({error:"Could not verify course permission."},{status:503});}
 if(body.action==="publish"){
   const {data:modules,error}=await db.from("course_modules").select("id")
     .eq("college_id",college).eq("course_id",course.id);
   if(error||!modules?.length)return NextResponse.json({error:"Create course chapters first."},{status:409});
   const {error:lessonsError}=await db.from("course_lessons").update({is_published:true})
     .eq("college_id",college).in("module_id",modules.map(x=>x.id));
   if(lessonsError)return NextResponse.json({error:"Could not release the course lectures."},{status:503});
   const {error:publishError}=await db.from("courses").update({status:"active",updated_at:new Date().toISOString()})
     .eq("college_id",college).eq("id",course.id);
   if(publishError)return NextResponse.json({error:"Could not publish the course; retry."},{status:503});
   return NextResponse.json({success:true});
 }
 if(body.action==="approve"){
   const {data:classes,error}=await db.from("classes").select("id")
     .eq("college_id",college).eq("subject_id",course.subject_id).eq("is_active",true);
   if(error||!classes?.length)return NextResponse.json({error:"No active class for this course."},{status:503});
   const {data:enrollment,error:membershipError}=await db.from("class_enrollments")
     .select("id").eq("college_id",college).eq("student_id",body.student_id)
     .eq("status","active").in("class_id",classes.map(x=>x.id)).limit(1);
   if(membershipError||!enrollment?.length)return NextResponse.json({error:"Student is not enrolled."},{status:403});
   const {error:approvalError}=await db.from("youtube_course_approvals").upsert({
     college_id:college,course_id:course.id,student_id:body.student_id,approved_by:actor.userId,
   },{onConflict:"course_id,student_id",ignoreDuplicates:true});
   if(approvalError)return NextResponse.json({error:"Could not record faculty approval."},{status:503});
   return NextResponse.json({success:true});
 }
 for(const [type,id] of [["quiz",body.quiz_id],["assignment",body.assignment_id]] as const){
   if(!id)continue;
   const table=type==="quiz"?"quizzes":"assignments";
   const {data:assessment,error}=await db.from(table)
     .select("class_id").eq("college_id",college).eq("id",id).maybeSingle();
   if(error||!assessment)return NextResponse.json({error:"Chosen assessment is unavailable."},{status:403});
   const {data:cls,error:classError}=await db.from("classes")
     .select("subject_id").eq("id",assessment.class_id).eq("college_id",college).maybeSingle();
   if(classError||cls?.subject_id!==course.subject_id)return NextResponse.json({error:"Assessment must belong to the course subject."},{status:403});
 }
 const {error}=await db.from("youtube_course_requirements").upsert({
   college_id:college,course_id:course.id,watched_threshold:body.threshold,
   required_quiz_id:body.quiz_id,required_assignment_id:body.assignment_id,
   min_quiz_percent:body.min_quiz_percent,
   min_assignment_percent:body.min_assignment_percent,
   faculty_approval_required:body.faculty_approval_required,
 },{onConflict:"course_id"});
 if(error)return NextResponse.json({error:"Could not save academic course requirements."},{status:503});
 return NextResponse.json({success:true});
}
