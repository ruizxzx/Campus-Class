import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), class_id: z.string().uuid(), student_id: z.string().uuid(),
    reason: z.enum(["attendance","missing_work","low_scores","support","other"]), note: z.string().trim().min(3).max(3000),
    action_plan: z.string().trim().max(3000).optional(),
    follow_up_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
  z.object({ action: z.literal("resolve"), id: z.string().uuid() }),
  z.object({ action: z.literal("update"), id: z.string().uuid(),
    status: z.enum(["open","in_progress","resolved"]),
    action_plan: z.string().trim().max(3000).optional(),
    follow_up_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    outcome_note: z.string().trim().max(3000).optional() }),
]);
export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (!["faculty","admin"].includes(context.profile.role)) return NextResponse.json({ error: "Faculty access required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid follow-up." }, { status: 400 });
  const body = parsed.data;
  const db = createAdminClient();
  const collegeId = context.profile.college_id;
  let classId = body.action === "create" ? body.class_id : null;
  if (body.action !== "create") {
    const { data: item, error } = await db.from("student_interventions")
      .select("id,class_id").eq("id", body.id).eq("college_id", collegeId).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to find the intervention." }, { status: 503 });
    if (!item) return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
    classId = item.class_id;
  }
  if (!classId) return NextResponse.json({ error: "Class is required." }, { status: 400 });
  const { data: classroom, error: classError } = await db.from("classes")
    .select("id").eq("id", classId).eq("college_id", collegeId).maybeSingle();
  if (classError) return NextResponse.json({ error: "Could not verify class." }, { status: 503 });
  if (!classroom) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: assigned, error } = await db.from("class_faculty")
      .select("faculty_id").eq("college_id", collegeId).eq("class_id", classId).eq("faculty_id", context.userId).maybeSingle();
    if (error || !assigned) return NextResponse.json({ error: "You are not assigned to this class." }, { status: error ? 503 : 403 });
  }
  if (body.action === "create") {
    const { data: enrolled, error: enrolledError } = await db.from("class_enrollments")
      .select("id").eq("college_id", collegeId).eq("class_id", classId)
      .eq("student_id", body.student_id).eq("status", "active").maybeSingle();
    if (enrolledError || !enrolled) return NextResponse.json({ error: "Student is not enrolled in this class." }, { status: enrolledError ? 503 : 403 });
    const { error } = await db.from("student_interventions").insert({
      college_id: collegeId, class_id: classId, student_id: body.student_id,
      created_by: context.userId, reason: body.reason, note: body.note,
      action_plan: body.action_plan ?? null,
      follow_up_at: body.follow_up_at ?? null,
    });
    if (error) {
      console.error("Intervention creation failed", { code: error.code });
      return NextResponse.json({ error: "Could not record this follow-up." }, { status: 503 });
    }
  } else {
    const status = body.action === "resolve" ? "resolved" : body.status;
    const changes = {
      status,
      updated_at: new Date().toISOString(),
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      ...(body.action === "update" && body.action_plan !== undefined
        ? { action_plan: body.action_plan } : {}),
      ...(body.action === "update" && body.follow_up_at !== undefined
        ? { follow_up_at: body.follow_up_at } : {}),
      ...(body.action === "update" && body.outcome_note !== undefined
        ? { outcome_note: body.outcome_note } : {}),
    };
    const { error } = await db.from("student_interventions").update(changes)
      .eq("id", body.id).eq("college_id", collegeId);
    if (error) return NextResponse.json({ error: "Could not update this faculty follow-up." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
