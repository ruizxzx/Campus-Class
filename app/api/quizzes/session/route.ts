import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), quiz_id: z.string().uuid() }),
  z.object({ action: z.literal("save"), quiz_id: z.string().uuid(),
    answers: z.record(z.string().uuid(), z.union([z.string().max(5000), z.array(z.string().max(500)).max(50)])) }),
]);

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "student") {
    return NextResponse.json({ error: "Quiz attempts are for enrolled students." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid quiz session request." }, { status: 400 });
  const body = parsed.data;
  const db = createAdminClient();
  const collegeId = context.profile.college_id;
  const { data: quiz, error: quizError } = await db.from("quizzes")
    .select("id,class_id,status,opens_at,closes_at,duration_minutes,attempts_allowed")
    .eq("id", body.quiz_id).eq("college_id", collegeId).maybeSingle();
  if (quizError || !quiz) return NextResponse.json({ error: "Quiz unavailable." }, { status: quizError ? 503 : 404 });
  const now = Date.now();
  if (quiz.status !== "published" || (quiz.opens_at && Date.parse(quiz.opens_at) > now)
    || (quiz.closes_at && Date.parse(quiz.closes_at) <= now)) {
    return NextResponse.json({ error: "This quiz is not accepting attempts." }, { status: 409 });
  }
  const { data: enrollment, error: enrollmentError } = await db.from("class_enrollments")
    .select("id").eq("college_id", collegeId).eq("class_id", quiz.class_id)
    .eq("student_id", context.userId).eq("status", "active").maybeSingle();
  if (enrollmentError || !enrollment) {
    return NextResponse.json({ error: "You are not enrolled in this quiz's class." }, { status: enrollmentError ? 503 : 403 });
  }
  const { count, error: attemptsError } = await db.from("quiz_attempts")
    .select("id", { count: "exact", head: true }).eq("college_id", collegeId)
    .eq("quiz_id", quiz.id).eq("student_id", context.userId);
  if (attemptsError) return NextResponse.json({ error: "Unable to count quiz attempts." }, { status: 503 });
  const number = (count ?? 0) + 1;
  if (number > quiz.attempts_allowed) return NextResponse.json({ error: "No attempts remain for this quiz." }, { status: 409 });
  const filter = () => db.from("quiz_attempt_sessions")
    .select("id,draft_answers,started_at,expires_at,updated_at")
    .eq("college_id", collegeId).eq("quiz_id", quiz.id)
    .eq("student_id", context.userId).eq("attempt_number", number);
  let { data: session, error: sessionError } = await filter().maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Quiz draft storage is unavailable. Apply migration 202611180027." }, { status: 503 });

  if (!session && body.action === "start") {
    // Once started, the attempt's expiration never resets when a tab reloads.
    const endsAt = Math.min(
      now + (quiz.duration_minutes ? quiz.duration_minutes * 60000 : 7 * 86400000),
      quiz.closes_at ? Date.parse(quiz.closes_at) : Number.MAX_SAFE_INTEGER,
    );
    const { error: insertError } = await db.from("quiz_attempt_sessions").insert({
      college_id: collegeId, quiz_id: quiz.id, student_id: context.userId,
      attempt_number: number, started_at: new Date(now).toISOString(),
      expires_at: new Date(endsAt).toISOString(), draft_answers: {},
    });
    if (insertError && insertError.code !== "23505") {
      console.error("Quiz session insert failed", { code: insertError.code });
      return NextResponse.json({ error: "Could not start quiz attempt." }, { status: 503 });
    }
    const loaded = await filter().maybeSingle();
    session = loaded.data;
    sessionError = loaded.error;
  }
  if (sessionError || !session) return NextResponse.json({ error: "Start this quiz before saving answers." }, { status: 409 });
  if (now >= Date.parse(session.expires_at)) {
    return NextResponse.json({ error: "Your attempt has expired. Ask faculty to reopen it if required.", expired: true }, { status: 409 });
  }

  if (body.action === "save") {
    if (JSON.stringify(body.answers).length > 62000) return NextResponse.json({ error: "Answers are too large to save." }, { status: 413 });
    const { data: updated, error } = await db.from("quiz_attempt_sessions")
      .update({ draft_answers: body.answers, updated_at: new Date().toISOString() })
      .eq("id", session.id).eq("college_id", collegeId).eq("student_id", context.userId)
      .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (error || !updated) return NextResponse.json({ error: "Your answers could not be saved. Check connectivity and the timer." }, { status: 503 });
    return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  }

  return NextResponse.json({ success: true, answers: session.draft_answers,
    expiresAt: session.expires_at, timed: Boolean(quiz.duration_minutes), startedAt: session.started_at });
}
