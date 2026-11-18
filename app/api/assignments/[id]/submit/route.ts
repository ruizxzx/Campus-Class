import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { submitSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "student") return NextResponse.json({ error: "Only students can submit assignments." }, { status: 403 });
  const { id: assignmentId } = await params;
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid submission." }, { status: 400 });

  const admin = createAdminClient();
  const { data: assignment, error: assignmentError } = await admin.from("assignments").select("id,college_id,class_id,title,status,due_at,allow_late,allow_resubmission").eq("id", assignmentId).eq("college_id", context.profile.college_id).maybeSingle();
  if (assignmentError) {
    console.error("Assignment submission lookup failed", { code: assignmentError.code, message: assignmentError.message });
    return NextResponse.json({ error: "Could not check the assignment. Verify the required Supabase migrations." }, { status: 500 });
  }
  if (!assignment || assignment.status !== "published") return NextResponse.json({ error: "This assignment is not available for submission." }, { status: 404 });
  const { data: enrollment, error: enrollmentError } = await admin.from("class_enrollments").select("id,status").eq("college_id", assignment.college_id).eq("class_id", assignment.class_id).eq("student_id", context.userId).eq("status", "active").maybeSingle();
  if (enrollmentError) return NextResponse.json({ error: "Could not verify your class enrollment." }, { status: 500 });
  if (!enrollment) return NextResponse.json({ error: "You are not enrolled in this class." }, { status: 403 });

  const now = new Date();
  const isLate = Boolean(assignment.due_at && now.getTime() > new Date(assignment.due_at).getTime());
  if (isLate && !assignment.allow_late) return NextResponse.json({ error: "The deadline has passed and late submissions are disabled." }, { status: 409 });

  const { data: previous, error: previousError } = await admin.from("assignment_submissions").select("id,version").eq("college_id", assignment.college_id).eq("assignment_id", assignmentId).eq("student_id", context.userId).order("version", { ascending: false });
  if (previousError) return NextResponse.json({ error: "Could not check your submission history." }, { status: 500 });
  if ((previous?.length ?? 0) > 0 && !assignment.allow_resubmission) return NextResponse.json({ error: "Resubmission is disabled for this assignment." }, { status: 409 });

  const storagePrefix = `${assignment.college_id}/${assignment.class_id}/${assignmentId}/${context.userId}/`;
  for (const file of parsed.data.files) {
    if (!file.storage_path.startsWith(storagePrefix) || file.storage_path.includes("..")) {
      return NextResponse.json({ error: "An attachment path is not valid for this submission." }, { status: 400 });
    }
    const folder = storagePrefix.slice(0, -1);
    const { data: storedFiles, error: storageError } = await admin.storage.from("student-submissions").list(folder, { search: file.storage_path.slice(storagePrefix.length) });
    const fileName = file.storage_path.slice(storagePrefix.length);
    if (storageError || !storedFiles?.some((item) => item.name === fileName)) {
      return NextResponse.json({ error: `Uploaded file not found: ${file.file_name}` }, { status: 400 });
    }
  }

  const version = (previous?.[0]?.version ?? 0) + 1;
  const { data: submission, error: submissionError } = await admin.from("assignment_submissions").insert({
    college_id: assignment.college_id,
    assignment_id: assignmentId,
    student_id: context.userId,
    version,
    text_answer: parsed.data.text_answer,
    status: isLate ? "late" : "submitted",
    submitted_at: now.toISOString(),
  }).select("id").single();
  if (submissionError || !submission) {
    if (submissionError) console.error("Assignment submission creation failed", { code: submissionError.code, message: submissionError.message });
    if (submissionError?.code === "23505") return NextResponse.json({ error: "A submission was just saved. Refresh before submitting again." }, { status: 409 });
    return NextResponse.json({ error: "Could not save your submission." }, { status: 500 });
  }

  if (parsed.data.files.length) {
    const { error: filesError } = await admin.from("submission_attachments").insert(parsed.data.files.map((file) => ({
      college_id: assignment.college_id,
      submission_id: submission.id,
      file_name: file.file_name,
      storage_path: file.storage_path,
      mime_type: file.mime_type ?? null,
      file_size: file.file_size ?? null,
    })));
    if (filesError) {
      console.error("Assignment submission attachment creation failed", { code: filesError.code, message: filesError.message });
      await admin.from("assignment_submissions").delete().eq("id", submission.id).eq("student_id", context.userId);
      await admin.storage.from("student-submissions").remove(parsed.data.files.map((file) => file.storage_path));
      return NextResponse.json({ error: "Submission attachments could not be recorded." }, { status: 500 });
    }
  }

  const { data: facultyRows } = await admin.from("class_faculty").select("faculty_id").eq("class_id", assignment.class_id).eq("college_id", assignment.college_id);
  if (facultyRows?.length) {
    await admin.from("notifications").insert(facultyRows.map((row) => ({
      college_id: assignment.college_id,
      user_id: row.faculty_id,
      type: "assignment.submitted",
      title: "New assignment submission",
      body: `${context.profile.full_name} submitted ${assignment.title}.`,
      href: "/faculty/submissions",
    })));
  }
  await admin.from("activity_logs").insert({ college_id: assignment.college_id, actor_id: context.userId, action: "assignment.submitted", entity_type: "assignment_submission", entity_id: submission.id, details: { assignment_id: assignmentId, version, late: isLate } });
  return NextResponse.json({ success: true, submissionId: submission.id, version, late: isLate });
}
