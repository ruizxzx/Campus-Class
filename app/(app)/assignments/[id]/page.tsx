import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { StudentSubmissionEditor, StudentSubmissionForm } from "@/components/academic-workflows";
import { Download, FileText } from "lucide-react";
import { isPast } from "date-fns";
export default async function StudentAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["student"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: assignmentRaw } = await supabase
    .from("assignments")
    .select("id,title,description,instructions,issue_at,due_at,max_marks,allow_late,allow_resubmission,status,class_id,classes(section,subjects(name,code))")
    .eq("id", id)
    .eq("college_id", profile.college_id)
    .maybeSingle();
  const assignment: any = assignmentRaw;
  if (!assignment || assignment.status !== "published") notFound();

  const [attachments, submissions] = await Promise.all([
    supabase.from("assignment_attachments").select("id,file_name,storage_path").eq("assignment_id", id),
    supabase.from("assignment_submissions").select("id,version,status,submitted_at,text_answer").eq("assignment_id", id).eq("student_id", profile.id).order("version", { ascending: false }),
  ]);
  const referenceFiles = await Promise.all((attachments.data ?? []).map(async (file) => {
    const { data } = await supabase.storage.from("assignment-references").createSignedUrl(file.storage_path, 300);
    return { ...file, url: data?.signedUrl ?? null };
  }));
  const latestSubmission = submissions.data?.[0] ?? null;
  let latestSubmissionFiles: { id: string; file_name: string }[] = [];
  let latestSubmissionIsGraded = false;
  if (latestSubmission) {
    const [{ data: files, error: filesError }, { data: evaluation, error: evaluationError }] = await Promise.all([
      supabase.from("submission_attachments").select("id,file_name").eq("submission_id", latestSubmission.id),
      createAdminClient().from("assignment_evaluations").select("id").eq("college_id", profile.college_id).eq("submission_id", latestSubmission.id).maybeSingle(),
    ]);
    if (filesError) throw new Error(`Could not load submission attachments: ${filesError.message}`);
    if (evaluationError) throw new Error(`Could not check submission grading status: ${evaluationError.message}`);
    latestSubmissionFiles = files ?? [];
    latestSubmissionIsGraded = Boolean(evaluation);
  }

  const isLate = Boolean(assignment.due_at && isPast(new Date(assignment.due_at)));
  return <>
    <PageHeader title={assignment.title} description={`${assignment.classes?.subjects?.name ?? "Class"} · Section ${assignment.classes?.section ?? "—"} · ${assignment.max_marks} marks`}/>
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Assignment brief</div>
          <span className={`status-pill ${isLate ? "orange" : "green"}`}>{isLate ? "Past deadline" : "Published"}</span>
        </div>
        {assignment.description && <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{assignment.description}</p>}
        <div className="mt-5 border-t border-[var(--line)] pt-5">
          <div className="text-[10px] text-[var(--muted)]">Published {new Date(assignment.issue_at).toLocaleString()}</div>
          <div className="mt-4 text-xs font-semibold">Instructions</div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-7 text-[var(--muted)]">{assignment.instructions || "No additional instructions were provided."}</p>
        </div>
        {referenceFiles.length > 0 && <div className="mt-6 border-t border-[var(--line)] pt-5">
          <div className="mb-3 text-xs font-semibold">Reference materials</div>
          <div className="space-y-2">{referenceFiles.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]"><FileText size={15}/></div>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{file.file_name}</span>
            {file.url && <Link href={file.url} target="_blank" className="btn-secondary !p-2"><Download size={14}/></Link>}
          </div>)}</div>
        </div>}
      </section>
      <aside className="space-y-4">
        <div className="surface p-5">
          <div className="text-xs font-semibold">Deadline and status</div>
          <div className="mt-3 text-lg font-semibold tracking-tight">{assignment.due_at ? new Date(assignment.due_at).toLocaleString() : "No deadline"}</div>
          <div className="mt-1 text-[10px] text-[var(--muted)]">{isLate ? (assignment.allow_late ? "Late submissions accepted" : "Late submissions disabled") : "Submit before the deadline"}</div>
          <div className="mt-4 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">Resubmission: <span className="font-semibold text-[var(--text)]">{assignment.allow_resubmission ? "Allowed" : "Not allowed"}</span></div>
        </div>
        {(submissions.data?.length ?? 0) > 0 && <div className="surface p-5">
          <div className="mb-3 text-xs font-semibold">Submission history</div>
          {submissions.data?.map((submission) => <div key={submission.id} className="border-t border-[var(--line)] py-3 first:border-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Version {submission.version}</span>
              <span className={`status-pill ${submission.status === "late" ? "orange" : "green"}`}>{submission.status}</span>
            </div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{new Date(submission.submitted_at).toLocaleString()}</div>
          </div>)}
        </div>}
      </aside>
    </div>
    {latestSubmission && <div className="mt-5">
      <StudentSubmissionEditor
        submission={{ ...latestSubmission, attachments: latestSubmissionFiles }}
        isGraded={latestSubmissionIsGraded}
        isClosed={isLate && !assignment.allow_late}
      />
    </div>}
    <div className="mt-5">{isLate && !assignment.allow_late
      ? <div className="surface p-5"><div className="text-sm font-semibold">Submission closed</div><p className="mt-2 text-xs leading-6 text-[var(--muted)]">The deadline has passed and this assignment does not accept late submissions. Your existing submission history remains available above.</p></div>
      : <StudentSubmissionForm profile={profile} assignment={assignment} previousCount={submissions.data?.length ?? 0}/>}
    </div>
  </>;
}
