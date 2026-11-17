import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const now = new Date();
  // Vercel runs this daily at 08:30 Asia/Kolkata. A 36-hour lookahead ensures
  // every deadline is picked up by at least one daily run, with an idempotent key.
  const from = now.toISOString();
  const to = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data: assignments, error: assignmentError } = await admin
    .from("assignments")
    .select("id,college_id,class_id,title,due_at")
    .eq("status", "published")
    .not("due_at", "is", null)
    .gte("due_at", from)
    .lt("due_at", to);

  if (assignmentError) return NextResponse.json({ error: "Could not read upcoming deadlines." }, { status: 500 });
  let candidates = 0;
  const notices: { college_id: string; user_id: string; type: string; title: string; body: string; href: string; reference_key: string }[] = [];
  const upcomingAssignments = assignments ?? [];
  const submittedStudents = new Map<string, Set<string>>();

  if (upcomingAssignments.length) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: submissions, error: submissionError } = await admin
        .from("assignment_submissions")
        .select("id,assignment_id,student_id")
        .in("assignment_id", upcomingAssignments.map((assignment) => assignment.id))
        .order("assignment_id")
        .order("student_id")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (submissionError) return NextResponse.json({ error: "Could not read assignment submissions." }, { status: 500 });

      for (const submission of submissions ?? []) {
        const students = submittedStudents.get(submission.assignment_id) ?? new Set<string>();
        students.add(submission.student_id);
        submittedStudents.set(submission.assignment_id, students);
      }

      if ((submissions ?? []).length < pageSize) break;
    }
  }

  for (const assignment of upcomingAssignments) {
    const { data: roster, error: rosterError } = await admin
      .from("class_enrollments")
      .select("student_id")
      .eq("college_id", assignment.college_id)
      .eq("class_id", assignment.class_id)
      .eq("status", "active");
    if (rosterError) return NextResponse.json({ error: "Could not read a class roster." }, { status: 500 });
    for (const student of roster ?? []) {
      if (submittedStudents.get(assignment.id)?.has(student.student_id)) continue;
      candidates += 1;
      notices.push({
        college_id: assignment.college_id,
        user_id: student.student_id,
        type: "assignment.deadline_reminder",
        title: "Assignment due soon",
        body: `${assignment.title} is due within the next 36 hours.`,
        href: `/assignments/${assignment.id}`,
        reference_key: `deadline:${assignment.id}:${student.student_id}`,
      });
    }
  }

  let inserted = 0;
  if (notices.length) {
    const { data, error } = await admin
      .from("notifications")
      .upsert(notices, { onConflict: "user_id,reference_key", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: "Could not create deadline notifications." }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({ success: true, assignments: assignments?.length ?? 0, candidates, inserted });
}
