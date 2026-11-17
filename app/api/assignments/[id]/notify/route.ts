import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role === "student") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: assignment, error: assignmentError } = await admin.from("assignments").select("id,college_id,class_id,title,created_by,status").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (assignmentError) {
    console.error("Assignment notification lookup failed", { code: assignmentError.code, message: assignmentError.message });
    return NextResponse.json({ error: "Could not check the published assignment." }, { status: 500 });
  }
  if (!assignment || assignment.status !== "published") return NextResponse.json({ error: "Published assignment not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: access, error: accessError } = await admin.from("class_faculty").select("class_id,can_manage_assignments").eq("college_id", assignment.college_id).eq("class_id", assignment.class_id).eq("faculty_id", context.userId).maybeSingle();
    if (accessError) {
      console.error("Assignment notification permission lookup failed", { code: accessError.code, message: accessError.message });
      return NextResponse.json({ error: "Could not verify assignment notification permission." }, { status: 500 });
    }
    if (!access?.can_manage_assignments) return NextResponse.json({ error: "You do not have assignment management permission for this class." }, { status: 403 });
  }
  const { data: roster, error: rosterError } = await admin.from("class_enrollments").select("student_id").eq("college_id", assignment.college_id).eq("class_id", assignment.class_id).eq("status", "active");
  if (rosterError) {
    console.error("Assignment notification roster lookup failed", { code: rosterError.code, message: rosterError.message });
    return NextResponse.json({ error: "Could not read the class roster for notifications." }, { status: 500 });
  }
  if (roster?.length) {
    const { error } = await admin.from("notifications").insert(roster.map((item) => ({ college_id: assignment.college_id, user_id: item.student_id, type: "assignment.published", title: "New assignment", body: assignment.title, href: `/assignments/${assignment.id}` })));
    if (error) {
      console.error("Assignment notification creation failed", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Assignment published, but notifications could not be sent." }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true, notified: roster?.length ?? 0 });
}
