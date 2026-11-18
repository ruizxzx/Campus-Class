import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { quizQuestionSchema } from "@/lib/validators";

export const runtime = "nodejs";
const uuid = z.string().uuid();
const createSchema=z.object({
  action:z.literal("create"),subject_id:uuid,question:quizQuestionSchema,
  difficulty:z.enum(["easy","medium","hard"]).default("medium"),
});
const updateSchema=z.object({
  action:z.literal("update"),id:uuid,question:quizQuestionSchema,
  difficulty:z.enum(["easy","medium","hard"]).default("medium"),
});
const archiveSchema=z.object({action:z.literal("archive"),id:uuid});
const bodySchema=z.discriminatedUnion("action",[createSchema,updateSchema,archiveSchema]);

async function allowedSubjects(collegeId:string,userId:string,role:string) {
  const db=createAdminClient();
  if(role==="admin") {
    const {data,error}=await db.from("subjects").select("id").eq("college_id",collegeId).eq("is_active",true).limit(1000);
    if(error)throw Error("Cannot check college subjects");
    return new Set((data??[]).map((item)=>item.id));
  }
  const {data:memberships,error:membershipsError}=await db.from("class_faculty")
    .select("class_id").eq("college_id",collegeId).eq("faculty_id",userId);
  if(membershipsError)throw Error("Cannot check faculty assignments");
  const ids=(memberships??[]).map((item)=>item.class_id);
  if(!ids.length)return new Set<string>();
  const {data,error}=await db.from("classes").select("subject_id").eq("college_id",collegeId)
    .in("id",ids).eq("is_active",true).limit(1000);
  if(error)throw Error("Cannot load assigned subjects");
  return new Set((data??[]).map((item)=>item.subject_id));
}
async function staffContext(){
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="faculty"&&context.profile.role!=="admin")
    return NextResponse.json({error:"Staff permission required."},{status:403});
  return context;
}
export async function GET(request:Request){
  const context=await staffContext();
  if(isResponse(context))return context;
  const url=new URL(request.url);
  const subjectId=url.searchParams.get("subject_id");
  if(!subjectId||!uuid.safeParse(subjectId).success)
    return NextResponse.json({error:"Choose a valid subject."},{status:400});
  try{
    const allowed=await allowedSubjects(context.profile.college_id,context.userId,context.profile.role);
    if(!allowed.has(subjectId))return NextResponse.json({error:"Subject not assigned."},{status:403});
    const db=createAdminClient();
    const {data,error}=await db.from("question_bank_items")
      .select("id,subject_id,prompt,question_type,options,answer_key,marks,difficulty,created_at")
      .eq("college_id",context.profile.college_id).eq("subject_id",subjectId)
      .eq("archived",false).order("updated_at",{ascending:false}).limit(100);
    if(error)throw Error("Question bank query failed: "+error.code);
    return NextResponse.json({items:data??[]});
  }catch(error){
    console.error("Question bank load failed",{reason:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({error:"Could not load the question bank. Check SQL migration 033."},{status:503});
  }
}
export async function POST(request:Request){
  const context=await staffContext();
  if(isResponse(context))return context;
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid question."},{status:400});
  const body=parsed.data;
  const db=createAdminClient();
  const collegeId=context.profile.college_id;
  try{
    const allowed=await allowedSubjects(collegeId,context.userId,context.profile.role);
    let subjectId=body.action==="create"?body.subject_id:"";
    let itemOwner=context.userId;
    if(body.action!=="create"){
      const {data,error}=await db.from("question_bank_items").select("subject_id,created_by")
        .eq("id",body.id).eq("college_id",collegeId).eq("archived",false).maybeSingle();
      if(error)throw Error("Cannot read saved question: "+error.code);
      if(!data)return NextResponse.json({error:"Question not found."},{status:404});
      subjectId=data.subject_id;itemOwner=data.created_by;
    }
    if(!allowed.has(subjectId)|| (context.profile.role!=="admin"&&body.action!=="create"&&itemOwner!==context.userId))
      return NextResponse.json({error:"You cannot edit this subject's question."},{status:403});
    if(body.action==="archive"){
      const {error}=await db.from("question_bank_items").update({archived:true,updated_at:new Date().toISOString()})
        .eq("id",body.id).eq("college_id",collegeId);
      if(error)throw Error("Cannot archive question: "+error.code);
    }else{
      const item={
        question_type:body.question.question_type,prompt:body.question.prompt,
        options:body.question.options,answer_key:body.question.answer_key,
        marks:body.question.marks,difficulty:body.difficulty,updated_at:new Date().toISOString(),
      };
      const result=body.action==="create"
        ?await db.from("question_bank_items").insert({...item,subject_id:subjectId,
          college_id:collegeId,created_by:context.userId})
        :await db.from("question_bank_items").update(item).eq("id",body.id).eq("college_id",collegeId);
      if(result.error)throw Error("Cannot save question: "+result.error.code);
    }
    return NextResponse.json({success:true});
  }catch(error){
    console.error("Question bank mutation failed",{reason:error instanceof Error?error.message:"unknown"});
    return NextResponse.json({error:"Could not save question. Check migration 033."},{status:503});
  }
}
