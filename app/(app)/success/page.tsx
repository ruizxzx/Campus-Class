import { nowEpochMs } from "@/lib/time";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { StudentSuccessDashboard } from "@/components/student-success-dashboard";
import { summarizeStudent, releasedQuizEvidence, DEFAULT_SUPPORT_RULES, validSupportRules, type SupportRules } from "@/lib/student-success";
import { collectEvidence } from "@/lib/academic-evidence";
import { attendanceForStudent, weeklyAcademicTrends } from "@/lib/attendance-metrics";


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
  const [rosterResult, assignmentsResult, quizResult, sessionsResult, recordsResult, interventionsResult] = await Promise.all([
    db.from("class_enrollments").select("student_id").eq("college_id", collegeId).eq("class_id", classId).eq("status", "active").limit(1000),
    db.from("assignments").select("id,due_at").eq("college_id", collegeId).eq("class_id", classId).eq("status", "published").limit(1000),
    db.from("quizzes").select("id,max_marks").eq("college_id", collegeId).eq("class_id", classId).limit(1000),
    db.from("attendance_sessions").select("id,starts_at,expires_at,closed_at").eq("college_id", collegeId).eq("class_id", classId).limit(1000),
    collectEvidence<{session_id:string;student_id:string;status:string}>([classId],
      async(batch,from,to)=>db.from("attendance_records")
        .select("session_id,student_id,status").eq("college_id",collegeId)
        .in("class_id",batch).order("id").range(from,to)),
    collectEvidence<{id:string;student_id:string;reason:string;note:string;status:string;created_at:string;
      action_plan:string|null;follow_up_at:string|null;outcome_note:string|null;resolved_at:string|null}>([classId],
      async(batch,from,to)=>db.from("student_interventions")
        .select("id,student_id,reason,note,status,created_at,action_plan,follow_up_at,outcome_note,resolved_at")
        .eq("college_id",collegeId).in("class_id",batch)
        .order("created_at",{ascending:false}).order("id").range(from,to)),
  ]);
  const assignmentIdList = (assignmentsResult.data ?? []).map((item) => item.id);
  const quizIds = (quizResult.data ?? []).map((item) => item.id);
  const [submissionResult, attemptsResult] = await Promise.all([
    collectEvidence<{ assignment_id: string; student_id: string }>(assignmentIdList, async (batch, from, to) =>
      db.from("assignment_submissions").select("assignment_id,student_id")
        .eq("college_id", collegeId).in("assignment_id", batch).order("id").range(from,to)),
    collectEvidence<{ quiz_id: string; student_id: string; score: number | null; attempt_number: number; released_at:string|null }>(quizIds, async (batch, from, to) =>
      db.from("quiz_attempts").select("quiz_id,student_id,score,attempt_number,released_at")
        .eq("college_id", collegeId).in("quiz_id", batch)
        .not("released_at", "is", null).order("id").range(from,to)),
  ]);
  const errors = [rosterResult,assignmentsResult,submissionResult,quizResult,attemptsResult,sessionsResult,recordsResult,interventionsResult]
    .filter((result) => Boolean(result.error));
  if (errors.length || submissionResult.truncated || attemptsResult.truncated ||
    recordsResult.truncated || interventionsResult.truncated
    || (rosterResult.data?.length ?? 0) >= 1000
    || (assignmentsResult.data?.length ?? 0) >= 1000
    || (quizResult.data?.length ?? 0) >= 1000
    || (sessionsResult.data?.length ?? 0) >= 1000
) {
    console.error("Student success dataset failed", errors.map((result) => result.error?.code));
    return <><PageHeader title="Student Success Intelligence" description="Explainable early support signals, never automated academic penalties."/>
      <div role="alert" className="surface border-amber-500 p-5 text-sm">Could not load a complete academic evidence set. Verify the SQL migrations and query limits before interpreting support signals.</div></>;
  }
  const studentIds = (rosterResult.data ?? []).map((item) => item.student_id);
  const { data: profiles, error: profileError } = studentIds.length
    ? await db.from("profiles").select("id,full_name,email").eq("college_id", collegeId).in("id", studentIds).limit(1000)
    : { data: [], error: null };
  if (profileError) throw new Error("Unable to load class roster.");
  const names = new Map((profiles ?? []).map((item) => [item.id, { name: item.full_name, email: item.email }]));
  const assignmentIds = new Set((assignmentsResult.data ?? []).map((item) => item.id));
  const quizMap = new Map((quizResult.data ?? []).map((quiz) => [quiz.id, Number(quiz.max_marks)]));
  const releasedScores = releasedQuizEvidence(attemptsResult.data ?? [], quizMap);
  const sessions = (sessionsResult.data ?? []).filter((session) =>
    session.closed_at || Date.parse(session.expires_at) <= nowEpochMs());
  const sessionIds = new Set(sessions.map((session) => session.id));
  // College admin owns these explainable thresholds. When the forward patch
  // is not yet present, keep the old transparent defaults until it is applied.
  const { data: savedRules, error: rulesError } = await db.from("student_success_rules")
    .select("attendance_min_percent,overdue_assignment_count,quiz_min_percent,min_attendance_sessions,min_assigned_work,min_released_quizzes")
    .eq("college_id",collegeId).maybeSingle();
  const missingRulesTable=rulesError?.code==="PGRST205"
    || rulesError?.code==="42P01" || rulesError?.code==="PGRST116";
  if(rulesError&&!missingRulesTable)
    throw new Error("Unable to load Student Success support thresholds.");
  const rules:SupportRules=savedRules?{
    attendance_min_percent:Number(savedRules.attendance_min_percent),
    overdue_assignment_count:Number(savedRules.overdue_assignment_count),
    quiz_min_percent:Number(savedRules.quiz_min_percent),
    min_attendance_sessions:Number(savedRules.min_attendance_sessions),
    min_assigned_work:Number(savedRules.min_assigned_work),
    min_released_quizzes:Number(savedRules.min_released_quizzes),
  }:DEFAULT_SUPPORT_RULES;
  if(!validSupportRules(rules))throw new Error("Invalid college support thresholds.");

  const now = nowEpochMs();

  const trends=weeklyAcademicTrends(sessionsResult.data??[],recordsResult.data??[],
    attemptsResult.data??[],quizMap,studentIds,now);
  const upcomingDeadlines=(assignmentsResult.data??[]).filter((item)=>item.due_at
    && Date.parse(item.due_at)>now && Date.parse(item.due_at)<=now+7*86400000).length;

  const students = studentIds.map((id) => {
    const submittedIds = new Set((submissionResult.data ?? [])
      .filter((item) => item.student_id === id && assignmentIds.has(item.assignment_id)).map((item) => item.assignment_id));
    const attendance = attendanceForStudent([...sessionIds],
      (recordsResult.data ?? []).filter((item)=>item.student_id===id));
    const scores = releasedScores.get(id) ?? [];
    const metrics = summarizeStudent({
      attendanceSessions: attendance.eligible, attendedSessions: attendance.attended,
      assignedWork: assignmentIds.size, submittedWork: submittedIds.size,
      overdueWork: (assignmentsResult.data ?? []).filter((item) => item.due_at
        && Date.parse(item.due_at) < now && !submittedIds.has(item.id)).length,
      releasedQuizScores: scores,
    },rules);
    const person = names.get(id);
    return { id, name: person?.name ?? "Student", email: person?.email ?? "", ...metrics };
  }).sort((a,b) => ({ needs_support: 0, watch: 1, on_track: 2, insufficient_data: 3 })[a.level]
    - ({ needs_support: 0, watch: 1, on_track: 2, insufficient_data: 3 })[b.level]);

  return <>
    <PageHeader title="Student Success Intelligence" description="Evidence-based academic support signals and faculty-owned follow-ups. Not AI diagnoses or automatic grading."/>
    <StudentSuccessDashboard
      classId={classroom.id} classes={classOptions} students={students}
      interventions={interventionsResult.data ?? []} nowMs={now}
      rules={rules} canEditRules={profile.role==="admin"} rulesAvailable={!missingRulesTable}
      trends={trends} upcomingDeadlines={upcomingDeadlines}
    />
  </>;
}
