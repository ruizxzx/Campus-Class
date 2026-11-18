import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
async function getStudent(){
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="student")
    return NextResponse.json({error:"Only students can manage their private study history."},{status:403});
  return context;
}
export async function GET(){
  const context=await getStudent();
  if(isResponse(context))return context;
  const {data,error}=await createAdminClient().from("ai_study_exchanges")
    .select("id,request_id,mode,syllabus_id,question,answer,sources,created_at")
    .eq("college_id",context.profile.college_id).eq("student_id",context.userId)
    .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50);
  if(error) {
    console.error("Private Copilot history load failed",{code:error.code});
    return NextResponse.json({
      error:"Could not load saved Copilot history. Apply SQL migration 037."},{status:503});
  }
  const rows=(data??[]).reverse();
  return NextResponse.json({items:rows});
}
export async function DELETE(){
  const context=await getStudent();
  if(isResponse(context))return context;
  const {error}=await createAdminClient().from("ai_study_exchanges").delete()
    .eq("college_id",context.profile.college_id).eq("student_id",context.userId);
  if(error){
    console.error("Private Copilot history clear failed",{code:error.code});
    return NextResponse.json({error:"Could not clear saved study history."},{status:503});
  }
  return NextResponse.json({success:true});
}
