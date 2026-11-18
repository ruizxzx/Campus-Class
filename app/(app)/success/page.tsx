import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { StudentSuccessDashboard } from "@/components/student-success-dashboard";
import { summarizeStudent } from "@/lib/student-success";

export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const profile = await requireRole(["admin", "faculty"]);
  const db = createAdminClient();
  const collegeId = profile.college_id;
  const classRelations = profile.role === "faculty"
    ? await db.from("class_faculty").select("class_id").eq("college_id", collegeId).eq("faculty_id", profile.id)
    : { data: null, error: null };
  if (classRelations.error) throw new Error("Cannot verify faculty assignments.");
  const ids = classRelations.data?.map((item) => item.class_id) ?? [];
  const classQuery = db.from("classes").select("id,display_name,section,subjects(name,code)")
    .eq("college_id", collegeId).eq("is_active", true).order("display_name");
  const { data: classrooms, error: classesError } = profile.role === "admin"
    ? await classQuery.limit(200)
    : ids.length ? await classQuery.in("id", ids).limit(200) : { data: [], error: null };
  if (classesError) throw new Error("Cannot load assigned classes.");
  const classOptions = (classrooms ?? []).map((item) => {
    const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
    return { id: item.id, name: (subject?.name ?? item.display_name ?? "Class") + " · " + item.section };
  });
  const params = await searchParams;
  const classroom = classOptions.find((item) => item.id === params.class_id) ?? classOptions[0];
  if (!classroom) return <>
    <PageHeader title="Student Success Intelligence" description="Actionable, explainable academic support."/>
    <div className="surface p-8 text-sm text-[var(--muted)]">No active class is assigned to this account.</div>
  </>;

  const classId = classroom.id;
  const [rosterResult, assignmentsResult, submissionResult, quizResult, attemptsResult, sessionsResult, recordsResult, interventionsResult] = await Promise.all([
    db.from("class_enrollments").select("student_id").eq("college_id", collegeId).eq("class_id", classId).eq("status", "active").limit(1000),
    db.from("assignments").select("id,due_at").eq("college_id", collegeId).eq("class_id", classId).eq("status", "published").limit(1000),
    db.from("assignment_submissions").select("assignment_id,student_id").eq("college_id", collegeId).limit(5000),
    db.from("quizzes").select("id,max_marks").eq("college_id", collegeId).eq("class_id", classId).limit(1000),
    db.from("quiz_attempts").select("quiz_id,student_id,score,released_at").eq("college_id", collegeId).not("released_at", "is", null).limit(5000),
    db.from("attendance_sessions").select("id,expires_at,closed_at").eq("college_id", collegeId).eq("class_id", classId).limit(1000),
    db.from("attendance_records").select("session_id,student_id,status").eq("college_id", collegeId).eq("class_id", classId).limit(5000),
    db.from("student_interventions").select("id,student_id,reason,note,status,created_at").eq("college_id", collegeId).eq("class_id", classId).order("created_at", { ascending: false }).limit(500),
  ]);
  const errors = [rosterResult,assignmentsResult,submissionResult,quizResult,attemptsResult,sessionsResult,recordsResult,interventionsResult]
    .filter((result) => Boolean(result.error));
  if (errors.length) {
    console.error("Student success dataset failed", errors.map((result) => result.error?.code));
    return <><PageHeader title="Student Success Intelligence" description="Explainable early support signals, never automated academic penalties."/>
      <div role="alert" className="surface border-amber-500 p-5 text-sm">Could not load academic indicators. Make sure the Campus Class 2.0 SQL migration is applied, then refresh.</div></>;
  }
  const studentIds = (rosterResult.data ?? []).map((item) => item.student_id);
  const { data: profiles, error: profileError } = studentIds.length
    ? await db.from("profiles").select("id,full_name,email").eq("college_id", collegeId).in("id", studentIds).limit(1000)
    : { data: [], error: null };
  if (profileError) throw new Error("Unable to load class roster.");
  const names = new Map((profiles ?? []).map((item) => [item.id, { name: item.full_name, email: item.email }]));
  const assignmentIds = new Set((assignmentsResult.data ?? []).map((item) => item.id));
  const quizMap = new Map((quizResult.data ?? []).map((quiz) => [quiz.id, Number(quiz.max_marks)]));
  const sessions = (sessionsResult.data ?? []).filter((session) =>
    session.closed_at || Date.parse(session.expires_at) <= Date.now());
  const sessionIds = new Set(sessions.map((session) => session.id));
  const now = Date.now();

  const students = studentIds.map((id) => {
    const submittedIds = new Set((submissionResult.data ?? [])
      .filter((item) => item.student_id === id && assignmentIds.has(item.assignment_id)).map((item) => item.assignment_id));
    const attendance = new Set((recordsResult.data ?? [])
      .filter((item) => item.student_id === id && sessionIds.has(item.session_id) && ["present","late"].includes(item.status))
      .map((item) => item.session_id));
    const scores = (attemptsResult.data ?? []).filter((item) => item.student_id === id && item.score !== null
      && quizMap.has(item.quiz_id) && (quizMap.get(item.quiz_id) ?? 0) > 0)
      .map((item) => Number(item.score) / (quizMap.get(item.quiz_id) ?? 100) * 100);
    const metrics = summarizeStudent({
      attendanceSessions: sessions.length, attendedSessions: attendance.size,
      assignedWork: assignmentIds.size, submittedWork: submittedIds.size,
      overdueWork: (assignmentsResult.data ?? []).filter((item) => item.due_at
        && Date.parse(item.due_at) < now && !submittedIds.has(item.id)).length,
      releasedQuizScores: scores,
    });
    const person = names.get(id);
    return { id, name: person?.name ?? "Student", email: person?.email ?? "", ...metrics };
  }).sort((a,b) => ({ needs_support: 0, watch: 1, on_track: 2, insufficient_data: 3 })[a.level]
    - ({ needs_support: 0, watch: 1, on_track: 2, insufficient_data: 3 })[b.level]);

  return <>
    <PageHeader title="Student Success Intelligence" description="Evidence-based academic support signals and faculty-owned follow-ups. Not AI diagnoses or automatic grading."/>
    <StudentSuccessDashboard
      classId={classroom.id} classes={classOptions} students={students}
      interventions={interventionsResult.data ?? []}
    />
  </>;
}
