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
  const { data: code, error: codeError } = await admin.from("enrollment_codes").select("id,college_id,class_id,active,expires_at").eq("code_hash", codeHash).maybeSingle();
  if (codeError) return NextResponse.json({ error: "Could not verify the enrollment code. Please retry." }, { status: 503 });
  if (!code || !code.active || (code.expires_at && new Date(code.expires_at).getTime() <= Date.now())) return NextResponse.json({ error: "That class code is invalid, expired, or disabled." }, { status: 404 });
  if (code.college_id !== context.profile.college_id) return NextResponse.json({ error: "This class belongs to a different college workspace." }, { status: 403 });
  const { data: classRow, error: classError } = await admin.from("classes").select("id,is_active,enrollment_open").eq("id", code.class_id).eq("college_id", code.college_id).maybeSingle();
  if (classError) return NextResponse.json({ error: "Could not verify the class. Please retry." }, { status: 503 });
  if (!classRow?.is_active || !classRow.enrollment_open) return NextResponse.json({ error: "Enrollment is closed for this class." }, { status: 409 });

  const { data: prior, error: priorError } = await admin.from("class_enrollments")
    .select("id,status").eq("college_id", code.college_id)
    .eq("class_id", code.class_id).eq("student_id", context.userId).maybeSingle();
  if (priorError) return NextResponse.json({ error: "Could not check your previous enrollment." }, { status: 503 });
  if (prior?.status === "active") return NextResponse.json({ error: "You have already joined this class." }, { status: 409 });
  if (prior?.status === "removed") return NextResponse.json({ error: "An administrator removed this enrollment. Contact your college administrator." }, { status: 403 });
  let error: { code?: string; message?: string } | null;
  if (prior?.status === "left") {
    // Re-joining a voluntarily left enrollment must not bypass administrator removal.
    const restored = await admin.from("class_enrollments")
      .update({ status: "active", enrolled_at: new Date().toISOString() })
      .eq("id", prior.id).eq("college_id", code.college_id)
      .eq("student_id", context.userId).eq("status", "left").select("id").maybeSingle();
    error = restored.error;
    if (!error && !restored.data) return NextResponse.json({ error: "Enrollment changed. Please try again." }, { status: 409 });
  } else {
    const created = await admin.from("class_enrollments").insert({
      college_id: code.college_id, class_id: code.class_id, student_id: context.userId, status: "active",
    });
    error = created.error;
  }
  if (error?.code === "23505") return NextResponse.json({ error: "You have already joined this class." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Could not complete enrollment." }, { status: 500 });

  await admin.from("notifications").insert({ college_id: code.college_id, user_id: context.userId, type: "class.enrolled", title: "Class joined", body: "You are now enrolled in a class.", href: "/classes" });
  await admin.from("activity_logs").insert({ college_id: code.college_id, actor_id: context.userId, action: "class.enrolled", entity_type: "class", entity_id: code.class_id });
  return NextResponse.json({ success: true });
}
