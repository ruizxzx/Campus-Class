import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const schema = z.object({ lesson_id: z.string().uuid() }).strict();

/** Mark one published lesson, only for an actively enrolled student. */
export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "student") {
    return NextResponse.json({ error: "Only students may complete lessons." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });
  const admin = createAdminClient();
  const collegeId = context.profile.college_id;
  const { data: lesson, error: lessonError } = await admin.from("course_lessons")
    .select("id,is_published,course_modules!inner(course_id,courses!inner(id,college_id,subject_id,status))")
    .eq("id", parsed.data.lesson_id).eq("college_id", collegeId).maybeSingle();
  if (lessonError) {
    console.error("Lesson completion lookup failed", { code: lessonError.code });
    return NextResponse.json({ error: "Could not verify this lecture. Check the course database migrations." }, { status: 503 });
  }
  const moduleRow = Array.isArray(lesson?.course_modules) ? lesson?.course_modules[0] : lesson?.course_modules;
  const course = Array.isArray(moduleRow?.courses) ? moduleRow?.courses[0] : moduleRow?.courses;
  if (!lesson?.is_published || !course || course.status !== "active" || course.college_id !== collegeId)
    return NextResponse.json({ error: "This lecture is not available for completion." }, { status: 404 });

  const { data: classes, error: classError } = await admin.from("classes")
    .select("id").eq("college_id", collegeId).eq("subject_id", course.subject_id).eq("is_active", true);
  if (classError) return NextResponse.json({ error: "Could not verify course enrollment." }, { status: 503 });
  if (!classes?.length) return NextResponse.json({ error: "You are not enrolled in a class for this course." }, { status: 403 });
  const { data: enrolled, error: enrollmentError } = await admin.from("class_enrollments")
    .select("id").eq("college_id", collegeId).eq("student_id", context.userId)
    .eq("status", "active").in("class_id", classes.map(row => row.id)).limit(1);
  if (enrollmentError) return NextResponse.json({ error: "Could not verify course enrollment." }, { status: 503 });
  if (!enrolled?.length) return NextResponse.json({ error: "Join your active course class before completing lectures." }, { status: 403 });

  // Ignore duplicates, so retries never reset completion timestamps or award XP twice.
  const { error: progressError } = await admin.from("lesson_progress").upsert({
    college_id: collegeId, lesson_id: lesson.id, student_id: context.userId,
  }, { onConflict: "lesson_id,student_id", ignoreDuplicates: true });
  if (progressError) {
    console.error("Lesson progress save failed", { code: progressError.code, message: progressError.message });
    return NextResponse.json({
      error: progressError.code === "42501"
        ? "Lesson progress is blocked by database permissions. Apply forward SQL migration 040."
        : "Could not save lesson progress. Check the latest database migration.",
    }, { status: 503 });
  }
  const { data: certificate, error: certError } = await admin.from("academic_certificates")
    .select("id,certificate_number").eq("college_id", collegeId)
    .eq("student_id", context.userId).eq("course_id", course.id)
    .is("revoked_at", null).maybeSingle();
  if (certError) console.error("Lesson certificate status lookup failed", { code: certError.code });
  return NextResponse.json({
    success: true, lesson_id: lesson.id, course_id: course.id,
    certificate: certificate ? { id: certificate.id, number: certificate.certificate_number } : null,
  });
}
