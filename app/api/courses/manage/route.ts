import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const id = z.string().uuid();
const lesson = z.object({
  id:id.optional(),
  title:z.string().trim().min(2).max(180),
  plain_text:z.string().max(20000),
  video_url:z.union([z.string().trim().url().startsWith("https://").max(2000),z.literal("")]).nullable(),
  is_published:z.boolean(),
}).strict();
const moduleItem=z.object({
  id:id.optional(),
  title:z.string().trim().min(2).max(180),
  description:z.string().trim().max(2000).nullable().optional(),
  lessons:z.array(lesson).min(1).max(50),
}).strict();
const requestSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),subject_id:id,title:z.string().trim().min(2).max(180),
    description:z.string().max(5000),publish:z.boolean(),modules:z.array(moduleItem).min(1).max(30)}),
  z.object({action:z.literal("update"),course_id:id,subject_id:id,title:z.string().trim().min(2).max(180),
    description:z.string().max(5000),publish:z.boolean(),
    revision:z.string().datetime({offset:true}),
    modules:z.array(moduleItem).min(1).max(30)}),
  z.object({action:z.enum(["archive","publish"]),course_id:id,subject_id:id,
    revision:z.string().datetime({offset:true})}),
]);
export async function POST(request:Request) {
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="admin" && context.profile.role!=="faculty") {
    return NextResponse.json({error:"Faculty or administrator access required."},{status:403});
  }
  const bodyText=await request.text().catch(()=>null);
  if(!bodyText || bodyText.length>450000) {
    return NextResponse.json({error:"Course request is empty or too large."},{status:413});
  }
  let input:unknown;
  try{input=JSON.parse(bodyText);}catch{
    return NextResponse.json({error:"Invalid JSON body."},{status:400});
  }
  const parsed=requestSchema.safeParse(input);
  if(!parsed.success){
    return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid curriculum."},{status:400});
  }
  const data=parsed.data;
  if("modules" in data && data.modules.reduce((count,chapter)=>count+chapter.lessons.length,0)>300) {
    return NextResponse.json({error:"A course supports at most 300 lectures."},{status:400});
  }
  const db=createAdminClient();
  // The database function independently revalidates active staff role,
  // college, assigned subject and ownership of every existing lesson ID.
  // All curriculum edits either commit together or roll back together.
  const { data: courseId,error }=await db.rpc("save_course_curriculum",{
    p_college_id:context.profile.college_id,p_actor_id:context.userId,
    p_action:data.action,
    p_course_id:"course_id" in data?data.course_id:null,
    p_subject_id:data.subject_id,
    p_title:"title" in data?data.title:null,
    p_description:"description" in data?data.description:null,
    p_modules:"modules" in data?data.modules:null,
    p_publish:"publish" in data?data.publish:null,
    p_expected_updated_at:"revision" in data?data.revision:null,
  });
  if(error){
    if(error.code==="42501")return NextResponse.json({
      error:"You cannot modify this course, subject or lecture."},{status:403});
    if(error.code==="22023"||error.code==="22P02")return NextResponse.json({
      error:error.message},{status:400});
    if(error.code==="P0002")return NextResponse.json({error:"Course not found."},{status:404});
    if(error.code==="40001")return NextResponse.json({
      error:"This course was changed elsewhere. Reload the editor before saving."},{status:409});
    if(error.code==="PGRST202"||error.code==="42883")return NextResponse.json({
      error:"Apply SQL migration 036 before using transactional Learning Studio."},{status:503});
    console.error("Atomic course save failed",{code:error.code,message:error.message});
    return NextResponse.json({error:"Unable to save course. Check migration 036 and faculty permissions."},{status:503});
  }
  if(!courseId)return NextResponse.json({error:"Course database transaction returned no ID."},{status:503});
  const {error:auditError}=await db.from("activity_logs").insert({
    college_id:context.profile.college_id,actor_id:context.userId,
    action:"course."+data.action,entity_type:"course",entity_id:courseId,
  });
  if(auditError)console.error("Course activity audit write failed",{code:auditError.code});
  return NextResponse.json({id:courseId,status:data.action==="archive"?"archived":
    "publish" in data && !data.publish?"archived":"active"});
}
