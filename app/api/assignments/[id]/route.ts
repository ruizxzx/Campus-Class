import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role === "student") return NextResponse.json({ error: "Students cannot delete assignments." }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,college_id,class_id")
    .eq("id", id)
    .eq("college_id", context.profile.college_id)
    .maybeSingle();
  if (assignmentError) {
    console.error("Assignment deletion lookup failed", { code: assignmentError.code, message: assignmentError.message });
    return NextResponse.json({ error: "Could not load the assignment to delete." }, { status: 500 });
  }
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  if (context.profile.role === "faculty") {
    const { data: access, error: accessError } = await admin
      .from("class_faculty")
      .select("can_manage_assignments")
      .eq("college_id", assignment.college_id)
      .eq("class_id", assignment.class_id)
      .eq("faculty_id", context.userId)
      .maybeSingle();
    if (accessError) {
      console.error("Assignment deletion permission lookup failed", { code: accessError.code, message: accessError.message });
      return NextResponse.json({ error: "Could not verify assignment deletion permission." }, { status: 500 });
    }
    if (!access?.can_manage_assignments) return NextResponse.json({ error: "You do not have permission to delete this assignment." }, { status: 403 });
  }

  const { data: attachments, error: attachmentsError } = await admin
    .from("assignment_attachments")
    .select("storage_path")
    .eq("college_id", assignment.college_id)
    .eq("assignment_id", assignment.id);
  if (attachmentsError) {
    console.error("Assignment attachment lookup failed", { code: attachmentsError.code, message: attachmentsError.message });
    return NextResponse.json({ error: "Could not load the assignment's reference files." }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("assignments")
    .delete()
    .eq("id", assignment.id)
    .eq("college_id", assignment.college_id);
  if (deleteError) {
    console.error("Assignment deletion failed", { code: deleteError.code, message: deleteError.message });
    return NextResponse.json({ error: "Could not delete the assignment." }, { status: 500 });
  }

  const paths = (attachments ?? []).map((attachment) => attachment.storage_path);
  if (paths.length) {
    const { error: storageError } = await admin.storage.from("assignment-references").remove(paths);
    if (storageError) {
      console.error("Assignment reference file cleanup failed", { message: storageError.message });
      return NextResponse.json({ success: true, warning: "Assignment deleted, but its reference files could not be removed." });
    }
  }

  return NextResponse.json({ success: true });
}
