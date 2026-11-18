import { nowEpochMs } from "@/lib/time";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LocalizedPageHeader as PageHeader } from "@/components/localized-page-header";
import { AcademicDataState } from "@/components/academic-data-state";
import { academicIssueFor, academicLog, missingOptionalAcademicTable } from "@/lib/academic-health";
import { GradebookGrid } from "@/components/gradebook-grid";
import { bestReleasedQuizScores, collectEvidence, emptyEvidence, releasedAssignmentMarks } from "@/lib/academic-evidence";
import type { GradeWeights } from "@/lib/gradebook-policy";

export const dynamic = "force-dynamic";

export default async function GradebookPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const profile = await requireProfile();
  let db:ReturnType<typeof createAdminClient>;
  try{db=createAdminClient();}
  catch{
    academicLog("Gradebook.configuration", {code:"SERVER_CONFIG"});
    return <><PageHeader title="Gradebook" description="Private academic reporting."/>
      <AcademicDataState area="Gradebook" issue="configuration" admin={profile.role==="admin"}/></>;
  }
  const collegeId = profile.college_id;
  const membership = profile.role === "admin"
    ? null
    : profile.role === "faculty"
      ? await db.from("class_faculty").select("class_id,can_manage_assignments").eq("college_id", collegeId).eq("faculty_id", profile.id)
      : await db.from("class_enrollments").select("class_id").eq("college_id", collegeId).eq("student_id", profile.id).eq("status", "active");
  if(membership?.error){
    academicLog("gradebook.membership",membership.error);
    return <><PageHeader title="Academic gradebook" description="Published coursework and released grades."/>
      <AcademicDataState area="Gradebook" issue={academicIssueFor(membership.error)} admin={profile.role==="admin"}/></>;
  }
  const permittedIds = membership?.data?.map((row) => row.class_id) ?? [];
  const listQuery = db.from("classes").select("id,display_name,section,subjects(name)")
    .eq("college_id", collegeId).eq("is_active", true).order("display_name");
  const { data: classrooms, error: classError } = profile.role === "admin"
    ? await listQuery.limit(200)
    : permittedIds.length ? await listQuery.in("id", permittedIds).limit(200) : { data: [], error: null };
  if(classError){
    academicLog("gradebook.classes",classError);
    return <><PageHeader title="Academic gradebook" description="Published coursework and released grades."/>
      <AcademicDataState area="Gradebook" issue={academicIssueFor(classError)} admin={profile.role==="admin"}/></>;
  }
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
  const initialError=roster.error||assignmentResult.error||quizResult.error||sessionsResult.error;
  if(initialError){
    academicLog("gradebook.initial",initialError);
    return <><PageHeader title="Academic gradebook" description="Published coursework, scores and attendance."/>
      <AcademicDataState area="Gradebook" issue={academicIssueFor(initialError)} admin={profile.role==="admin"}/></>;
  }
  const ids = profile.role === "student" ? [profile.id] : (roster.data ?? []).map((item) => item.student_id);
  const assignmentIds = (assignmentResult.data ?? []).map((item) => item.id);
  const quizIds = (quizResult.data ?? []).map((item) => item.id);
  const sessionIds = (sessionsResult.data ?? []).map((item) => item.id);
  const [profilesResult, submissionResult, attemptsResult, attendanceResult] = await Promise.all([
    ids.length
      ? db.from("profiles").select("id,full_name").eq("college_id", collegeId).in("id", ids).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    ids.length ? collectEvidence<{ id:string; assignment_id:string; student_id:string; version:number }>(assignmentIds, async (batch,from,to) =>
      db.from("assignment_submissions").select("id,assignment_id,student_id,version").eq("college_id",collegeId)
        .in("assignment_id",batch).in("student_id",ids).order("id").range(from,to)) : emptyEvidence<{id:string;assignment_id:string;student_id:string;version:number}>(),
    ids.length ? collectEvidence<{ id:string; quiz_id:string; student_id:string; score:number|null; released_at:string|null }>(quizIds, async (batch,from,to) =>
      db.from("quiz_attempts").select("id,quiz_id,student_id,score,released_at").eq("college_id",collegeId)
        .in("quiz_id",batch).in("student_id",ids).order("id").range(from,to)) : emptyEvidence<{id:string;quiz_id:string;student_id:string;score:number|null;released_at:string|null}>(),
    ids.length ? collectEvidence<{ id:string; student_id:string; session_id:string; status:string }>(sessionIds, async (batch,from,to) =>
      db.from("attendance_records").select("id,student_id,session_id,status").eq("college_id",collegeId)
        .in("session_id",batch).in("student_id",ids).order("id").range(from,to)) : emptyEvidence<{id:string;student_id:string;session_id:string;status:string}>(),
  ]);
  if (profilesResult.error || submissionResult.error || attemptsResult.error || attendanceResult.error
      || submissionResult.truncated || attemptsResult.truncated || attendanceResult.truncated
      || (roster.data?.length ?? 0)>=1000 || (assignmentResult.data?.length ?? 0)>=100
      || (quizResult.data?.length ?? 0)>=100 || (sessionsResult.data?.length ?? 0)>=500) {
    const error=profilesResult.error||submissionResult.error||attemptsResult.error||attendanceResult.error;
    academicLog("gradebook.evidence",error??{code:"INCOMPLETE"});
    return <><PageHeader title="Academic gradebook" description="Published coursework and released grades."/>
      <AcademicDataState area="Gradebook" issue={error?academicIssueFor(error):"incomplete"} admin={profile.role==="admin"}/></>;
  }
  // Explicit per-class grading policy is optional. Without it we display
  // descriptive recorded-score averages, never invent an official weighting.
  const { data: policyRow, error: policyError } = await db.from("class_gradebook_policies")
    .select("assignment_weight,project_weight,quiz_weight,attendance_weight")
    .eq("college_id", collegeId).eq("class_id", classId).maybeSingle();
  const missingPolicyTable=missingOptionalAcademicTable(policyError);
  if (policyError && !missingPolicyTable) {
    academicLog("gradebook.policy",policyError);
    return <><PageHeader title="Academic gradebook" description="Published coursework and released grades."/>
      <AcademicDataState area="Gradebook" issue={academicIssueFor(policyError)} admin={profile.role==="admin"}/></>;
  }
  const gradeWeights: GradeWeights | null = policyRow ? {
    assignment_weight: Number(policyRow.assignment_weight),
    project_weight: Number(policyRow.project_weight),
    quiz_weight: Number(policyRow.quiz_weight),
    attendance_weight: Number(policyRow.attendance_weight),
  } : null;
  const canEditPolicy = profile.role === "admin" || (profile.role === "faculty"
    && (membership?.data ?? []).some((item) => item.class_id === classId
      && "can_manage_assignments" in item && item.can_manage_assignments === true));
  const submissions=submissionResult.data;
  const submissionIds=submissions.map((item)=>item.id);
  const evaluationResult=await collectEvidence<{ id:string; submission_id:string; marks:number; released_at:string|null }>(
    submissionIds, async (batch,from,to)=>db.from("assignment_evaluations")
      .select("id,submission_id,marks,released_at").eq("college_id",collegeId)
      .in("submission_id",batch).order("id").range(from,to));
  if (evaluationResult.error || evaluationResult.truncated) {
    academicLog("gradebook.evaluations",evaluationResult.error??{code:"INCOMPLETE"});
    return <><PageHeader title="Academic gradebook" description="Published coursework and released grades."/>
      <AcademicDataState area="Gradebook" issue={evaluationResult.error?academicIssueFor(evaluationResult.error):"incomplete"} admin={profile.role==="admin"}/></>;
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
    <GradebookGrid classes={classes} classId={selected.id} columns={columns} rows={people}
      staff={profile.role !== "student"} weights={gradeWeights}
      policyAvailable={!missingPolicyTable} canEditPolicy={canEditPolicy}/>
  </>;
}
