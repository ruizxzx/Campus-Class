import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { validGradeWeights } from "@/lib/gradebook-policy";

export const runtime = "nodejs";
const uuid=z.string().uuid();
const weightsSchema=z.object({
  assignment_weight:z.number().min(0).max(100),
  project_weight:z.number().min(0).max(100),
  quiz_weight:z.number().min(0).max(100),
  attendance_weight:z.number().min(0).max(100),
}).strict().refine(validGradeWeights,{message:"Weights must total 100% and have at most two decimal places."});
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),class_id:uuid,weights:weightsSchema}),
  z.object({action:z.literal("reset"),class_id:uuid}),
]);

export async function POST(request:Request){
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="admin"&&context.profile.role!=="faculty")
    return NextResponse.json({error:"Only college staff can update grading policies."},{status:403});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)
    return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid grading policy."},{status:400});
  const body=parsed.data, db=createAdminClient(), collegeId=context.profile.college_id;
  const {data:courseClass,error:classError}=await db.from("classes")
    .select("id").eq("college_id",collegeId).eq("id",body.class_id).eq("is_active",true).maybeSingle();
  if(classError)return NextResponse.json({error:"Could not verify the class."},{status:503});
  if(!courseClass)return NextResponse.json({error:"Class not found."},{status:404});
  if(context.profile.role==="faculty"){
    const {data:relation,error}=await db.from("class_faculty").select("can_manage_assignments")
      .eq("college_id",collegeId).eq("class_id",body.class_id)
      .eq("faculty_id",context.userId).maybeSingle();
    if(error)return NextResponse.json({error:"Could not verify grading permissions."},{status:503});
    if(!relation?.can_manage_assignments)
      return NextResponse.json({error:"You cannot manage grading policies for this class."},{status:403});
  }
  if(body.action==="save"){
    const {error}=await db.from("class_gradebook_policies").upsert({
      college_id:collegeId,class_id:body.class_id,
      ...body.weights,updated_by:context.userId,updated_at:new Date().toISOString(),
    },{onConflict:"college_id,class_id"});
    if(error){
      console.error("Grading policy save failed",{code:error.code});
      return NextResponse.json({error:"Could not save grading policy. Apply SQL migration 034."},{status:503});
    }
  }else{
    const {error}=await db.from("class_gradebook_policies").delete()
      .eq("college_id",collegeId).eq("class_id",body.class_id);
    if(error){
      console.error("Grading policy reset failed",{code:error.code});
      return NextResponse.json({error:"Could not reset grading policy. Apply SQL migration 034."},{status:503});
    }
  }
  await db.from("activity_logs").insert({
    college_id:collegeId,actor_id:context.userId,action:"class.gradebook_policy."+body.action,
    entity_type:"class",entity_id:body.class_id,
  });
  return NextResponse.json({success:true});
}
