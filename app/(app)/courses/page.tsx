import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { LearningHubHeader } from "@/components/learning-hub-header";
import Link from "next/link";
import { ArrowRight, BookOpen, Layers } from "lucide-react";

type CourseListRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subjects: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] | null;
  course_modules: { id: string; course_lessons: { id: string }[] | null }[] | null;
};

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const profile = await requireProfile();
  const db = await createClient();
  const { subject: subjectId } = await searchParams;
  const validSubjectId = subjectId && /^[0-9a-f-]{36}$/i.test(subjectId) ? subjectId : null;
  const query = db.from("courses")
    .select("id,title,description,status,subjects(id,name,code),course_modules(id,course_lessons(id))")
    .eq("status", "active")
    .eq("college_id", profile.college_id)
    .order("created_at", { ascending: false });
  const { data: courses, error } = await query;
  if (error) {
    console.error("Unable to load course materials", error);
    throw new Error("Unable to load courses.");
  }
  const allCourseRows = (courses ?? []) as CourseListRow[];
  const courseRows = validSubjectId
    ? allCourseRows.filter((course) => course.subjects && (Array.isArray(course.subjects) ? course.subjects[0]?.id : course.subjects.id) === validSubjectId)
    : allCourseRows;
  const subjects = [...new Map(allCourseRows.flatMap((course) => {
    const subject = Array.isArray(course.subjects) ? course.subjects[0] : course.subjects;
    return subject ? [[subject.id, subject] as const] : [];
  })).values()].sort((first, second) => first.name.localeCompare(second.name));
  return (
    <>
      <LearningHubHeader
        active="courses"
        title="Make progress, one lecture at a time."
        description="Explore subject-led courses, follow chapter-by-chapter lessons, and pick up where you left off."
        canAuthor={profile.role === "faculty" || profile.role === "admin"}
      />
      <section className="surface-flat mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Course library</div>
          <div className="mt-1 text-xs text-[var(--muted)]">{courseRows.length} {courseRows.length === 1 ? "course" : "courses"}{validSubjectId ? " in this subject" : " available to you"}</div>
        </div>
        <form action="/courses" className="flex w-full gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="course-subject-filter">Filter by subject</label>
          <select id="course-subject-filter" name="subject" defaultValue={validSubjectId ?? ""} className="input-base min-w-0 flex-1 sm:w-64">
            <option value="">All subjects</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}
          </select>
          <button type="submit" className="btn-secondary shrink-0">Filter</button>
        </form>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courseRows.length ? courseRows.map((course) => {
          const subject = Array.isArray(course.subjects) ? course.subjects[0] : course.subjects;
          const lessonCount = (course.course_modules ?? []).reduce((total, module) => total + (module.course_lessons?.length ?? 0), 0);
          return (
            <Link
              href={`/courses/${course.id}`}
              key={course.id}
              className="surface group flex min-h-56 flex-col p-5 transition-[transform,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--green)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BookOpen size={19} /></div>
                {subject?.code ? <span className="status-pill">{subject.code}</span> : null}
              </div>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{subject?.name ?? "Subject course"}</div>
              <h2 className="mt-1 text-base font-semibold leading-6 tracking-[-.025em]">{course.title}</h2>
              {course.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{course.description}</p> : null}
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5"><Layers size={13} />{course.course_modules?.length ?? 0} chapters · {lessonCount} lectures</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--green-strong)]">Open course <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" /></span>
              </div>
            </Link>
          );
        }) : (
          <div className="surface col-span-full">
            <EmptyState
              title={validSubjectId ? "No courses in this subject yet" : "Your course library is ready to grow"}
              description={validSubjectId ? "Try another subject or check back when more lessons are published." : "Published course materials for your enrolled subjects will appear here."}
            />
          </div>
        )}
      </div>
    </>
  );
}
