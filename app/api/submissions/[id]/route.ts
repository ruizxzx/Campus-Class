import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { editSubmissionSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "student") return NextResponse.json({ error: "Only students can edit their own submissions." }, { status: 403 });

  const { id } = await params;
  const parsed = editSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid submission." }, { status: 400 });

  const admin = createAdminClient();
  const { data: submission, error: submissionError } = await admin
    .from("assignment_submissions")
    .select("id,assignment_id,college_id,student_id")
    .eq("id", id)
    .eq("college_id", context.profile.college_id)
    .eq("student_id", context.userId)
    .maybeSingle();
  if (submissionError) {
    console.error("Student submission lookup failed", { code: submissionError.code, message: submissionError.message });
    return NextResponse.json({ error: "Could not load your submission." }, { status: 500 });
  }
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,status")
    .eq("id", submission.assignment_id)
    .eq("college_id", submission.college_id)
    .maybeSingle();
  if (assignmentError) {
    console.error("Submission assignment lookup failed", { code: assignmentError.code, message: assignmentError.message });
    return NextResponse.json({ error: "Could not check the assignment." }, { status: 500 });
  }
  if (!assignment || assignment.status !== "published") return NextResponse.json({ error: "This assignment is no longer available." }, { status: 404 });

  const { data: evaluation, error: evaluationError } = await admin
    .from("assignment_evaluations")
    .select("id")
    .eq("college_id", submission.college_id)
    .eq("submission_id", submission.id)
    .maybeSingle();
  if (evaluationError) {
    console.error("Submission grading-state lookup failed", { code: evaluationError.code, message: evaluationError.message });
    return NextResponse.json({ error: "Could not check whether your submission has been graded." }, { status: 500 });
  }
  if (evaluation) return NextResponse.json({ error: "This submission can no longer be edited because it has been graded." }, { status: 409 });

  const { data: attachments, error: attachmentsError } = await admin
    .from("submission_attachments")
    .select("id")
    .eq("college_id", submission.college_id)
    .eq("submission_id", submission.id)
    .limit(1);
  if (attachmentsError) {
    console.error("Submission attachment lookup failed", { code: attachmentsError.code, message: attachmentsError.message });
    return NextResponse.json({ error: "Could not check your submission attachments." }, { status: 500 });
  }
  if (!parsed.data.text_answer.trim() && !attachments?.length) {
    return NextResponse.json({ error: "Add a written answer; existing attachments will remain on your submission." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("assignment_submissions")
    .update({ text_answer: parsed.data.text_answer.trim() || null })
    .eq("id", submission.id)
    .eq("college_id", submission.college_id)
    .eq("student_id", context.userId);
  if (updateError) {
    console.error("Student submission update failed", { code: updateError.code, message: updateError.message });
    return NextResponse.json({ error: "Could not save your submission changes." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
