import { istDate } from "@/lib/display";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { AssignmentEditor, EvaluationTable } from "@/components/academic-workflows";
import { Download, FileText } from "lucide-react";

export default async function FacultyAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["faculty"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,title,description,instructions,due_at,max_marks,class_id,status,created_by,allow_late,allow_resubmission,published_at")
    .eq("id", id)
    .eq("college_id", profile.college_id)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: access } = await supabase
    .from("class_faculty")
    .select("class_id,can_manage_assignments")
    .eq("class_id", assignment.class_id)
    .eq("college_id", profile.college_id)
    .eq("faculty_id", profile.id)
    .maybeSingle();
  if (!access) notFound();

  const [submissions, attachments] = await Promise.all([
    supabase.from("assignment_submissions").select("id,student_id,version,text_answer,status,submitted_at").eq("assignment_id", id).order("submitted_at", { ascending: false }),
    supabase.from("assignment_attachments").select("id,file_name,storage_path").eq("assignment_id", id),
  ]);
  const ids = [...new Set((submissions.data ?? []).map((submission) => submission.student_id))];
  const submissionIds = (submissions.data ?? []).map((submission) => submission.id);
  const [students, files, evaluations] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id,full_name,email").in("id", ids) : Promise.resolve({ data: [] as any[] }),
    submissionIds.length ? supabase.from("submission_attachments").select("*").in("submission_id", submissionIds) : Promise.resolve({ data: [] as any[] }),
    submissionIds.length ? supabase.from("assignment_evaluations").select("submission_id,marks,feedback,released_at").in("submission_id", submissionIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const rows = (submissions.data ?? []).map((submission) => ({
    ...submission,
    student: students.data?.find((student) => student.id === submission.student_id),
    attachments: files.data?.filter((file) => file.submission_id === submission.id) ?? [],
    evaluation: evaluations.data?.find((evaluation) => evaluation.submission_id === submission.id) ?? null,
    assignment,
  }));
  const referenceFiles = await Promise.all((attachments.data ?? []).map(async (file) => {
    const { data } = await supabase.storage.from("assignment-references").createSignedUrl(file.storage_path, 300);
    return { ...file, url: data?.signedUrl ?? null };
  }));
  const canEvaluate = access.can_manage_assignments;
  const canEdit = canEvaluate;

  return <>
    <PageHeader
      title={assignment.title}
      description={`Maximum marks: ${assignment.max_marks} · ${assignment.due_at ? `Due ${istDate(assignment.due_at)}` : "No deadline"}`}
      action={<Link href="/faculty/submissions" className="btn-secondary">All submissions</Link>}
    />
    {canEdit && <AssignmentEditor assignment={assignment} />}
    {assignment.description && <div className="surface mb-4 p-5"><div className="text-xs font-semibold">Description</div><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{assignment.description}</p></div>}
    {assignment.instructions && <div className="surface mb-4 p-5"><div className="text-xs font-semibold">Instructions</div><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{assignment.instructions}</p></div>}
    {referenceFiles.length > 0 && <section className="surface mb-5 p-5"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><FileText size={14}/>Reference materials</div><div className="flex flex-wrap gap-2">{referenceFiles.map((file) => file.url ? <Link key={file.id} href={file.url} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-2 text-[10px]"><Download size={13}/>{file.file_name}</Link> : <span key={file.id} className="text-[10px] text-[var(--muted)]">{file.file_name} · unavailable</span>)}</div></section>}
    <div className="mb-4 text-sm font-semibold">Submissions <span className="ml-1 text-[var(--muted)]">({rows.length})</span></div>
    <EvaluationTable submissions={rows} canEvaluate={canEvaluate} />
  </>;
}
