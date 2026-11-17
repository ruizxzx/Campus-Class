import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { format } from "date-fns";

type Evaluation = {
  marks: number;
  feedback: string | null;
  released_at: string | null;
};

type Relation<T> = T | T[] | null;

type SubmissionResult = {
  id: string;
  assignments: Relation<{
    title: string;
    max_marks: number;
    classes: Relation<{ display_name: string; subjects: Relation<{ name: string }> }>;
  }>;
  assignment_evaluations: Relation<Evaluation>;
};

function firstRelation<T>(relation: Relation<T> | undefined): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

export default async function ResultsPage() {
  const profile = await requireProfile();
  const db = await createClient();
  const { data: submissions, error } = await db
    .from("assignment_submissions")
    .select("id,status,submitted_at,assignments(title,max_marks,classes(display_name,subjects(name))),assignment_evaluations(marks,feedback,released_at)")
    .eq("student_id", profile.id)
    .order("submitted_at", { ascending: false });

  if (error) console.error("Unable to load results", error);

  const visible = ((submissions ?? []) as SubmissionResult[]).flatMap((submission) => {
    const relation = submission.assignment_evaluations;
    const evaluations = Array.isArray(relation) ? relation : relation ? [relation] : [];
    const evaluation = evaluations.find((item): item is Evaluation & { released_at: string } => item.released_at !== null);
    return evaluation ? [{ submission, assignment: firstRelation(submission.assignments), evaluation }] : [];
  });

  return <>
    <PageHeader title="Results & feedback" description="Marks and feedback released by your faculty."/>
    <div className="space-y-3">
      {visible.length ? visible.map(({ submission, assignment, evaluation }) => {
        const classInfo = firstRelation(assignment?.classes);
        const subject = firstRelation(classInfo?.subjects);
        return (
          <article className="surface p-5" key={submission.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{assignment?.title}</h2>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {subject?.name} · {classInfo?.display_name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums">
                  {evaluation.marks}
                  <span className="text-xs text-[var(--muted)]">/{assignment?.max_marks}</span>
                </div>
                <div className="text-[10px] text-[var(--muted)]">
                  Released {format(new Date(evaluation.released_at), "dd MMM yyyy")}
                </div>
              </div>
            </div>
            {evaluation.feedback
              ? <p className="mt-3 rounded-xl bg-[var(--surface-2)] p-3 text-sm leading-6">{evaluation.feedback}</p>
              : null}
          </article>
        );
      }) : <EmptyState title="No released results" description="Evaluated work will appear here after your faculty releases the marks and feedback."/>}
    </div>
  </>;
}
