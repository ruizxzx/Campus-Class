import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { validSupportRules, type SupportRules } from "@/lib/student-success";

export const runtime = "nodejs";
const schema=z.object({
  attendance_min_percent:z.number().min(0).max(100),
  overdue_assignment_count:z.number().int().min(1).max(100),
  quiz_min_percent:z.number().min(0).max(100),
  min_attendance_sessions:z.number().int().min(1).max(100),
  min_assigned_work:z.number().int().min(1).max(100),
  min_released_quizzes:z.number().int().min(1).max(100),
}).strict().refine((data)=>validSupportRules(data),{message:"Invalid academic support rules."});

export async function POST(request:Request){
  const context=await requestProfile();
  if(isResponse(context))return context;
  if(context.profile.role!=="admin")
    return NextResponse.json({error:"Only college administrators can change Student Success rules."},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid rules."},{status:400});
  const rules:SupportRules=parsed.data;
  const db=createAdminClient();
  const {error}=await db.from("student_success_rules").upsert({
    ...rules,college_id:context.profile.college_id,
    updated_by:context.userId,updated_at:new Date().toISOString(),
  },{onConflict:"college_id"});
  if(error){
    console.error("Student support rule save failed",{code:error.code});
    return NextResponse.json({error:"Could not save support thresholds. Apply SQL migration 035."},{status:503});
  }
  await db.from("activity_logs").insert({
    college_id:context.profile.college_id,actor_id:context.userId,
    action:"college.student_success_rules.updated",
    entity_type:"college",entity_id:context.profile.college_id,
  });
  return NextResponse.json({success:true});
}
