import { scopedClasses } from "@/lib/class-scope";
import { classLabel, istDate } from "@/lib/display";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { LearningHubHeader } from "@/components/learning-hub-header";
import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardCheck, Clock3, ListChecks } from "lucide-react";

type QuizListClass = {
  display_name: string | null;
  section: string;
  subjects: { name: string } | { name: string }[] | null;
};

type QuizListRow = {
  id: string;
  title: string;
  description: string | null;
  opens_at: string | null;
  closes_at: string | null;
  duration_minutes: number | null;
  max_marks: number;
  attempts_allowed: number;
  status: string;
  classes: QuizListClass | QuizListClass[] | null;
};

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const profile = await requireProfile();
  const db = await createClient();
  const { class: classId } = await searchParams;
  const validClassId = classId && /^[0-9a-f-]{36}$/i.test(classId) ? classId : null;
  const classes=await scopedClasses(profile);
  const ids=classes.map(c=>c.id).filter(id=>!validClassId||id===validClassId);
  let query = db.from("quizzes")
    .select("id,title,description,opens_at,closes_at,duration_minutes,max_marks,attempts_allowed,status,classes(display_name,section,subjects(name))")
    .eq("college_id", profile.college_id)
    .order("created_at", { ascending: false });
  if(profile.role==="student")query=query.eq("status","published");
  const { data: quizzes, error } = ids.length?await query.in("class_id",ids):{data:[],error:null};
  if (error) {
    console.error("Unable to load assessments", error);
    throw new Error("Unable to load assessments.");
  }
  const quizRows = (quizzes ?? []) as QuizListRow[];
  const publishedCount = quizRows.filter((quiz) => quiz.status === "published").length;
  return (
    <>
      <LearningHubHeader
        active="assessments"
        title="Check your understanding."
        description="Find upcoming quizzes and exams, review the time and attempt details, and see released results in one place."
        canAuthor={profile.role === "faculty" || profile.role === "admin"}
      />
      <section className="surface-flat mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Assessment schedule</div>
          <div className="mt-1 text-xs text-[var(--muted)]">{publishedCount} published · {quizRows.length} {quizRows.length === 1 ? "assessment" : "assessments"}</div>
        </div>
        <form action="/quizzes" className="flex w-full gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="assessment-class-filter">Filter by class</label>
          <select id="assessment-class-filter" name="class" defaultValue={validClassId ?? ""} className="input-base min-w-0 flex-1 sm:w-64">
            <option value="">All accessible classes</option>
            {(classes ?? []).map((classroom) => <option key={classroom.id} value={classroom.id}>{classLabel(classroom)}</option>)}
          </select>
          <button type="submit" className="btn-secondary shrink-0">Filter</button>
        </form>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {quizRows.length ? quizRows.map((quiz) => {
          const classroom = Array.isArray(quiz.classes) ? quiz.classes[0] : quiz.classes;
          const subject = Array.isArray(classroom?.subjects) ? classroom.subjects[0] : classroom?.subjects;
          return (
            <Link href={`/quizzes/${quiz.id}`} key={quiz.id} className="surface group flex min-h-56 flex-col p-5 transition-[transform,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--green)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><ClipboardCheck size={16} /></span>
                  <span className="truncate">{subject?.name ?? "Class assessment"} · {classroom?.display_name}</span>
                </span>
                <span className={`status-pill ${quiz.status === "published" ? "green" : ""}`}>
                  {quiz.status === "published" ? "Published" : "Draft"}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold tracking-[-.025em]">{quiz.title}</h2>
              {quiz.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{quiz.description}</p> : null}
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--line)] pt-4 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5"><ListChecks size={13} />{quiz.max_marks} marks</span>
                {quiz.duration_minutes ? <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{quiz.duration_minutes} min</span> : null}
                <span>{quiz.attempts_allowed} {quiz.attempts_allowed === 1 ? "attempt" : "attempts"}</span>
                {quiz.closes_at ? <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} />Due {istDate(quiz.closes_at)}</span> : null}
                <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--green-strong)]">Details <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" /></span>
              </div>
            </Link>
          );
        }) : (
          <EmptyState title="No assessments available" description="Published assessments for this classroom will appear here." />
        )}
      </div>
    </>
  );
}
