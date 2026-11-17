import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { evaluateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (!(["admin", "faculty"] as string[]).includes(context.profile.role)) return NextResponse.json({ error: "Students cannot evaluate submissions." }, { status: 403 });
  const { id: submissionId } = await params;
  const parsed = evaluateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid evaluation." }, { status: 400 });

  const admin = createAdminClient();
  const { data: submission } = await admin.from("assignment_submissions").select("id,college_id,assignment_id,student_id,assignments!inner(id,class_id,title,max_marks)").eq("id", submissionId).eq("college_id", context.profile.college_id).maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;
  if (!assignment || parsed.data.marks > Number(assignment.max_marks)) return NextResponse.json({ error: `Marks cannot exceed ${assignment?.max_marks ?? "the assignment maximum"}.` }, { status: 400 });

  if (context.profile.role === "faculty") {
    const { data: assignmentAccess } = await admin.from("class_faculty").select("can_manage_assignments").eq("college_id", context.profile.college_id).eq("class_id", assignment.class_id).eq("faculty_id", context.userId).maybeSingle();
    if (!assignmentAccess?.can_manage_assignments) return NextResponse.json({ error: "You are not authorized to evaluate this class." }, { status: 403 });
  }

  const releasedAt = parsed.data.release ? new Date().toISOString() : null;
  const { error: evaluationError } = await admin.from("assignment_evaluations").upsert({
    college_id: context.profile.college_id,
    submission_id: submissionId,
    marks: parsed.data.marks,
    feedback: parsed.data.feedback,
    evaluated_by: context.userId,
    evaluated_at: new Date().toISOString(),
    released_at: releasedAt,
  }, { onConflict: "college_id,submission_id" });
  if (evaluationError) {
    console.error("Assignment evaluation save failed", { code: evaluationError.code, message: evaluationError.message });
    return NextResponse.json({ error: "Could not save the evaluation." }, { status: 500 });
  }

  if (parsed.data.release) {
    await admin.from("assignment_submissions").update({ status: "evaluated" }).eq("id", submissionId).eq("college_id", context.profile.college_id);
    await admin.from("notifications").insert({ college_id: context.profile.college_id, user_id: submission.student_id, type: "assignment.evaluated", title: "Assignment evaluated", body: `Your work for ${assignment.title} has been evaluated.`, href: "/results" });
  }
  await admin.from("activity_logs").insert({ college_id: context.profile.college_id, actor_id: context.userId, action: parsed.data.release ? "assignment.evaluation.released" : "assignment.evaluation.saved", entity_type: "assignment_submission", entity_id: submissionId });
  return NextResponse.json({ success: true, released: parsed.data.release });
}
