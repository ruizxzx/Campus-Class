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
  // PostgREST returns at most 1,000 rows per request in this project.
  // Page assignments, submissions and rosters independently so no student is
  // silently skipped. Each notice has a stable key for safe partial retries.
  const pageSize = 200;
  let assignmentsProcessed = 0;
  let candidates = 0;
  let inserted = 0;

  for (let assignmentOffset = 0; ; assignmentOffset += pageSize) {
    const { data: assignments, error: assignmentError } = await admin.from("assignments")
      .select("id,college_id,class_id,title,due_at")
      .eq("status", "published")
      .not("due_at", "is", null)
      .gte("due_at", from)
      .lt("due_at", to)
      .order("due_at", { ascending: true })
      .order("id", { ascending: true })
      .range(assignmentOffset, assignmentOffset + pageSize - 1);
    if (assignmentError) {
      console.error("Deadline reminder assignments lookup failed", { code: assignmentError.code });
      return NextResponse.json({ error: "Could not read upcoming deadlines.", assignments: assignmentsProcessed, inserted }, { status: 503 });
    }
    if (!assignments?.length) break;

    for (const assignment of assignments) {
      assignmentsProcessed += 1;
      const submittedStudents = new Set<string>();
      for (let offset = 0; ; offset += pageSize) {
        const { data: submissions, error: submissionError } = await admin.from("assignment_submissions")
          .select("id,student_id")
          .eq("college_id", assignment.college_id)
          .eq("assignment_id", assignment.id)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (submissionError) {
          console.error("Deadline reminder submission lookup failed", { code: submissionError.code });
          return NextResponse.json({ error: "Could not read assignment submissions.", assignments: assignmentsProcessed, inserted }, { status: 503 });
        }
        for (const item of submissions ?? []) submittedStudents.add(item.student_id);
        if ((submissions?.length ?? 0) < pageSize) break;
      }

      for (let offset = 0; ; offset += pageSize) {
        const { data: roster, error: rosterError } = await admin.from("class_enrollments")
          .select("student_id")
          .eq("college_id", assignment.college_id)
          .eq("class_id", assignment.class_id)
          .eq("status", "active")
          .order("student_id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (rosterError) {
          console.error("Deadline reminder roster lookup failed", { code: rosterError.code });
          return NextResponse.json({ error: "Could not read a class roster.", assignments: assignmentsProcessed, inserted }, { status: 503 });
        }
        if (!roster?.length) break;

        const notices = roster.filter((student) => !submittedStudents.has(student.student_id))
          .map((student) => ({
            college_id: assignment.college_id,
            user_id: student.student_id,
            type: "assignment.deadline_reminder",
            title: "Assignment due soon",
            body: `${assignment.title} is due within the next 36 hours.`,
            href: `/assignments/${assignment.id}`,
            reference_key: `deadline:${assignment.id}:${student.student_id}`,
          }));
        candidates += notices.length;
        if (notices.length) {
          const { data, error } = await admin.from("notifications")
            .upsert(notices, { onConflict: "user_id,reference_key", ignoreDuplicates: true })
            .select("id");
          if (error) {
            console.error("Deadline reminder notification write failed", { code: error.code });
            return NextResponse.json({ error: "Could not create deadline notifications.", assignments: assignmentsProcessed, inserted }, { status: 503 });
          }
          inserted += data?.length ?? 0;
        }
        if (roster.length < pageSize) break;
      }
    }
    if (assignments.length < pageSize) break;
  }

  return NextResponse.json({ success: true, assignments: assignmentsProcessed, candidates, inserted });
}
