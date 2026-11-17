import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { joinClassSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "student") return NextResponse.json({ error: "Only student accounts can join classes." }, { status: 403 });
  const parsed = joinClassSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid class code." }, { status: 400 });

  const admin = createAdminClient();
  const codeHash = createHash("sha256").update(parsed.data.code).digest("hex");
  const { data: code } = await admin.from("enrollment_codes").select("id,college_id,class_id,active,expires_at").eq("code_hash", codeHash).maybeSingle();
  if (!code || !code.active || (code.expires_at && new Date(code.expires_at).getTime() <= Date.now())) return NextResponse.json({ error: "That class code is invalid, expired, or disabled." }, { status: 404 });
  if (code.college_id !== context.profile.college_id) return NextResponse.json({ error: "This class belongs to a different college workspace." }, { status: 403 });
  const { data: classRow } = await admin.from("classes").select("id,is_active,enrollment_open").eq("id", code.class_id).eq("college_id", code.college_id).maybeSingle();
  if (!classRow?.is_active || !classRow.enrollment_open) return NextResponse.json({ error: "Enrollment is closed for this class." }, { status: 409 });

  const { error } = await admin.from("class_enrollments").insert({ college_id: code.college_id, class_id: code.class_id, student_id: context.userId, status: "active" });
  if (error?.code === "23505") return NextResponse.json({ error: "You have already joined this class." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Could not complete enrollment." }, { status: 500 });

  await admin.from("notifications").insert({ college_id: code.college_id, user_id: context.userId, type: "class.enrolled", title: "Class joined", body: "You are now enrolled in a class.", href: "/classes" });
  await admin.from("activity_logs").insert({ college_id: code.college_id, actor_id: context.userId, action: "class.enrolled", entity_type: "class", entity_id: code.class_id });
  return NextResponse.json({ success: true });
}
