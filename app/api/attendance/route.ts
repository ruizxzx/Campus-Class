import { NextResponse } from "next/server";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { attendanceQrSvg } from "@/lib/qr/svg";

export const runtime = "nodejs";
const uuid = z.string().uuid();
const payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), class_id: uuid, title: z.string().trim().min(2).max(120), minutes: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("checkin"), session_id: uuid, token: z.string().min(24).max(120) }),
  z.object({ action: z.literal("close"), session_id: uuid }),
  z.object({ action: z.literal("correct"), session_id: uuid, student_id: uuid, status: z.enum(["present", "late", "absent", "excused"]) }),
]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function permittedStaff(db: ReturnType<typeof createAdminClient>, collegeId: string, userId: string, role: string, classId: string) {
  const { data: classroom, error: classroomError } = await db.from("classes").select("id")
    .eq("id", classId).eq("college_id", collegeId).eq("is_active", true).maybeSingle();
  if (classroomError) return { allowed: false, failure: errorResponse("Could not verify this class.", 503) };
  if (!classroom) return { allowed: false, failure: errorResponse("The class is unavailable.", 404) };
  if (role === "admin") return { allowed: true, failure: null };
  if (role !== "faculty") return { allowed: false, failure: errorResponse("Only assigned faculty or administrators can manage attendance.", 403) };
  const { data: relation, error } = await db.from("class_faculty").select("faculty_id")
    .eq("college_id", collegeId).eq("class_id", classId).eq("faculty_id", userId).maybeSingle();
  if (error) return { allowed: false, failure: errorResponse("Could not verify faculty permissions.", 503) };
  if (!relation) return { allowed: false, failure: errorResponse("You are not assigned to this class.", 403) };
  return { allowed: true, failure: null };
}

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Invalid attendance request.");
  const body = parsed.data;
  const { role, college_id: collegeId } = context.profile;
  const db = createAdminClient();
  if (body.action === "create") {
    const access = await permittedStaff(db, collegeId, context.userId, role, body.class_id);
    if (!access.allowed) return access.failure!;
    const token = randomBytes(24).toString("base64url");
    const start = new Date();
    const { data: session, error } = await db.from("attendance_sessions").insert({
      college_id: collegeId, class_id: body.class_id, created_by: context.userId,
      title: body.title, starts_at: start.toISOString(),
      expires_at: new Date(start.getTime() + body.minutes * 60000).toISOString(),
      token_hash: hash(token),
    }).select("id,title,expires_at").single();
    if (error || !session) {
      console.error("Attendance session creation failed", { code: error?.code });
      return errorResponse(error?.code === "42P01" || error?.code === "PGRST205"
        ? "Apply the Campus Class 2.0 database migration before creating sessions."
        : "Could not create the attendance session.", 503);
    }
    const link = new URL("/attendance?session=" + session.id + "&token=" + encodeURIComponent(token), request.url).toString();
    return NextResponse.json({ session, checkinLink: link, qrSvg: attendanceQrSvg(link) });
  }
  // Never trust a client-provided class_id: load the actual session first.
  const { data: session, error: sessionError } = await db.from("attendance_sessions")
    .select("id,college_id,class_id,token_hash,starts_at,expires_at,closed_at")
    .eq("id", body.session_id).eq("college_id", collegeId).maybeSingle();
  if (sessionError) return errorResponse("Could not load the attendance session.", 503);
  if (!session) return errorResponse("Attendance session not found.", 404);

  if (body.action === "checkin") {
    if (role !== "student") return errorResponse("Only students can check in.", 403);
    const candidate = Buffer.from(hash(body.token), "hex");
    const expected = Buffer.from(session.token_hash, "hex");
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      return errorResponse("Invalid attendance code.", 403);
    }
    const now = Date.now();
    if (session.closed_at || now < Date.parse(session.starts_at) || now >= Date.parse(session.expires_at)) {
      return errorResponse("This attendance session is closed or expired.", 409);
    }
    const { data: enrollment, error: enrollmentError } = await db.from("class_enrollments")
      .select("id").eq("college_id", collegeId).eq("class_id", session.class_id)
      .eq("student_id", context.userId).eq("status", "active").maybeSingle();
    if (enrollmentError) return errorResponse("Could not verify enrollment.", 503);
    if (!enrollment) return errorResponse("You are not enrolled in this class.", 403);
    const { error } = await db.from("attendance_records").insert({
      college_id: collegeId, class_id: session.class_id, session_id: session.id,
      student_id: context.userId, recorded_by: context.userId, status: "present",
    });
    if (error?.code === "23505") return NextResponse.json({ success: true, alreadyCheckedIn: true });
    if (error?.code === "23P01") return errorResponse("This attendance session has closed or expired.", 409);
    if (error?.code === "42501") return errorResponse("Your active enrollment could not be verified.", 403);
    if (error) {
      console.error("Attendance check-in failed", { code: error.code });
      return errorResponse("Could not record attendance. Please try again.", 503);
    }
    return NextResponse.json({ success: true });
  }
  const access = await permittedStaff(db, collegeId, context.userId, role, session.class_id);
  if (!access.allowed) return access.failure!;
  if (body.action === "close") {
    const { error } = await db.from("attendance_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", session.id).eq("college_id", collegeId).is("closed_at", null);
    if (error) return errorResponse("Could not close the attendance session.", 503);
    return NextResponse.json({ success: true });
  }
  const { data: enrollment, error: enrollmentError } = await db.from("class_enrollments")
    .select("id").eq("college_id", collegeId).eq("class_id", session.class_id)
    .eq("student_id", body.student_id).eq("status", "active").maybeSingle();
  if (enrollmentError) return errorResponse("Could not verify student enrollment.", 503);
  if (!enrollment) return errorResponse("The student is not enrolled in this class.", 403);
  const { error } = await db.from("attendance_records").upsert({
    college_id: collegeId, class_id: session.class_id, session_id: session.id,
    student_id: body.student_id, recorded_by: context.userId, status: body.status,
    updated_at: new Date().toISOString(),
  }, { onConflict: "session_id,student_id" });
  if (error) {
    console.error("Attendance correction failed", { code: error.code });
    return errorResponse("Could not save attendance correction.", 503);
  }
  return NextResponse.json({ success: true });
}
