import { nowEpochMs } from "@/lib/time";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { GradebookGrid } from "@/components/gradebook-grid";
import { bestReleasedQuizScores, collectEvidence, releasedAssignmentMarks } from "@/lib/academic-evidence";

export const dynamic = "force-dynamic";

export default async function GradebookPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const profile = await requireProfile();
  const db = createAdminClient();
  const collegeId = profile.college_id;
  const membership = profile.role === "admin"
    ? null
    : profile.role === "faculty"
      ? await db.from("class_faculty").select("class_id").eq("college_id", collegeId).eq("faculty_id", profile.id)
      : await db.from("class_enrollments").select("class_id").eq("college_id", collegeId).eq("student_id", profile.id).eq("status", "active");
  if (membership?.error) throw new Error("Unable to verify class membership.");
  const permittedIds = membership?.data?.map((row) => row.class_id) ?? [];
  const listQuery = db.from("classes").select("id,display_name,section,subjects(name)")
    .eq("college_id", collegeId).eq("is_active", true).order("display_name");
  const { data: classrooms, error: classError } = profile.role === "admin"
    ? await listQuery.limit(200)
    : permittedIds.length ? await listQuery.in("id", permittedIds).limit(200) : { data: [], error: null };
  if (classError) throw new Error("Unable to load gradebook classes.");
  const classes = (classrooms ?? []).map((item) => {
    const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
    return { id: item.id, name: (subject?.name ?? item.display_name ?? "Class") + " · " + item.section };
  });
  const query = await searchParams;
  const selected = classes.find((item) => item.id === query.class_id) ?? classes[0];
  if (!selected) return <>
    <PageHeader title="Academic gradebook" description="A unified view of coursework, assessments and attendance."/>
    <div className="surface p-8 text-sm text-[var(--muted)]">Join or create a class to use the gradebook.</div>
  </>;
  const classId = selected.id;
  const [roster, assignmentResult, quizResult, sessionsResult] = await Promise.all([
    db.from("class_enrollments").select("student_id").eq("college_id", collegeId).eq("class_id", classId).eq("status", "active").limit(1000),
    db.from("assignments").select("id,title,work_type,max_marks").eq("college_id", collegeId).eq("class_id", classId).eq("status", "published").order("created_at").limit(100),
    db.from("quizzes").select("id,title,max_marks").eq("college_id", collegeId).eq("class_id", classId).eq("status", "published").order("created_at").limit(100),
    db.from("attendance_sessions").select("id,closed_at,expires_at").eq("college_id", collegeId).eq("class_id", classId).limit(500),
  ]);
  if (roster.error || assignmentResult.error || quizResult.error || sessionsResult.error) {
    return <><PageHeader title="Academic gradebook" description="Published coursework, scores and attendance."/>
      <p role="alert" className="surface p-5 text-sm">Unable to load gradebook. Check that Campus Class 2.0 migrations were applied.</p></>;
  }
  const ids = profile.role === "student" ? [profile.id] : (roster.data ?? []).map((item) => item.student_id);
  const assignmentIds = (assignmentResult.data ?? []).map((item) => item.id);
  const quizIds = (quizResult.data ?? []).map((item) => item.id);
  const sessionIds = (sessionsResult.data ?? []).map((item) => item.id);
  const [profilesResult, submissionResult, attemptsResult, attendanceResult] = await Promise.all([
    ids.length
      ? db.from("profiles").select("id,full_name").eq("college_id", collegeId).in("id", ids).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    collectEvidence<{ id:string; assignment_id:string; student_id:string; version:number }>(assignmentIds, async (batch,from,to) =>
      db.from("assignment_submissions").select("id,assignment_id,student_id,version").eq("college_id",collegeId)
        .in("assignment_id",batch).in("student_id",ids).order("id").range(from,to)),
    collectEvidence<{ id:string; quiz_id:string; student_id:string; score:number|null; released_at:string|null }>(quizIds, async (batch,from,to) =>
      db.from("quiz_attempts").select("id,quiz_id,student_id,score,released_at").eq("college_id",collegeId)
        .in("quiz_id",batch).in("student_id",ids).order("id").range(from,to)),
    collectEvidence<{ id:string; student_id:string; session_id:string; status:string }>(sessionIds, async (batch,from,to) =>
      db.from("attendance_records").select("id,student_id,session_id,status").eq("college_id",collegeId)
        .in("session_id",batch).in("student_id",ids).order("id").range(from,to)),
  ]);
  if (profilesResult.error || submissionResult.error || attemptsResult.error || attendanceResult.error
      || submissionResult.truncated || attemptsResult.truncated || attendanceResult.truncated
      || (roster.data?.length ?? 0)>=1000 || (assignmentResult.data?.length ?? 0)>=100
      || (quizResult.data?.length ?? 0)>=100 || (sessionsResult.data?.length ?? 0)>=500) {
    throw new Error("Gradebook dataset incomplete: check database permissions or pagination limits.");
  }
  const submissions=submissionResult.data;
  const submissionIds=submissions.map((item)=>item.id);
  const evaluationResult=await collectEvidence<{ id:string; submission_id:string; marks:number; released_at:string|null }>(
    submissionIds, async (batch,from,to)=>db.from("assignment_evaluations")
      .select("id,submission_id,marks,released_at").eq("college_id",collegeId)
      .in("submission_id",batch).order("id").range(from,to));
  if (evaluationResult.error || evaluationResult.truncated) {
    throw new Error("Gradebook evaluation evidence is incomplete.");
  }
  const assignmentMarks=releasedAssignmentMarks(submissions,evaluationResult.data);
  const quizMarks=bestReleasedQuizScores(attemptsResult.data);
  const columns = [
    ...(assignmentResult.data ?? []).map((item) => ({ key: "assignment:" + item.id, title: item.title, type: item.work_type ?? "assignment", maxMarks: Number(item.max_marks) })),
    ...(quizResult.data ?? []).map((item) => ({ key: "quiz:" + item.id, title: item.title, type: "quiz", maxMarks: Number(item.max_marks) })),
  ];
  const completedSessions = new Set((sessionsResult.data ?? []).filter((item) => item.closed_at || Date.parse(item.expires_at) <= nowEpochMs()).map((item) => item.id));
  const people = (profilesResult.data ?? []).map((person) => {
    const scores = columns.map((column) => {
      const resourceId = column.key.split(":")[1];
      if (column.key.startsWith("assignment:")) {
        return assignmentMarks.get(resourceId + ":" + person.id) ?? null;
      }
      return quizMarks.get(resourceId + ":" + person.id) ?? null;
    });
    const relevant = (attendanceResult.data ?? []).filter((item) => item.student_id === person.id
      && completedSessions.has(item.session_id) && ["present","late"].includes(item.status));
    const attendance = completedSessions.size ? Math.round(new Set(relevant.map((item) => item.session_id)).size / completedSessions.size * 100) : null;
    return { id: person.id, name: person.full_name, scores, attendance };
  });
  return <>
    <PageHeader title="Academic gradebook" description="One place for assignment marks, quiz results and attendance. Students only see released grades."/>
    <GradebookGrid classes={classes} classId={selected.id} columns={columns} rows={people} staff={profile.role !== "student"}/>
  </>;
}
