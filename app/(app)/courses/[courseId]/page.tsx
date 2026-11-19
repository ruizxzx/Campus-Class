import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { LearningHubHeader } from "@/components/learning-hub-header";
import { CourseLearningViewer, type LearningModule } from "@/components/course-learning-viewer";
import { AISummarizeButton } from "@/components/ai-summarize-button";
import { AIResourceAssistant } from "@/components/ai-resource-assistant";

type CourseLesson = {
  id: string;
  title: string;
  plain_text: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  position: number;
  is_published: boolean;
};

type CourseModule = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  course_lessons: CourseLesson[] | null;
};

type CourseDetailRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subject_id: string;
  subjects: { name: string; code: string } | { name: string; code: string }[] | null;
  course_modules: CourseModule[] | null;
};

export default async function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const profile = await requireProfile();
  const db = await createClient();
  const { data: courseRaw, error } = await db.from("courses")
    .select("id,title,description,status,subject_id,subjects(name,code),course_modules(id,title,description,position,course_lessons(id,title,plain_text,video_url,duration_minutes,position,is_published))")
    .eq("id", courseId)
    .maybeSingle();
  if (error) {
    console.error("Unable to load course curriculum", error);
    throw new Error("Unable to load this course.");
  }
  if (!courseRaw) return <EmptyState title="Course not found" description="This course may be unavailable to your college account." />;

  // Keep the embedded PostgREST relation shape explicit for this curriculum query.
  const course = courseRaw as CourseDetailRow;
  const subject = Array.isArray(course.subjects) ? course.subjects[0] : course.subjects;
  let canTrackProgress = profile.role === "student";
  if (profile.role === "student") {
    const { data: activeClasses, error: classError } = await db.from("classes")
      .select("id").eq("college_id", profile.college_id)
      .eq("subject_id", course.subject_id).eq("is_active", true);
    if (classError) throw new Error("Could not check course enrollment.");
    canTrackProgress = false;
    if (activeClasses?.length) {
      const { data: enrollment, error: enrollmentError } = await db.from("class_enrollments")
        .select("id").eq("college_id", profile.college_id)
        .eq("student_id", profile.id).eq("status", "active")
        .in("class_id", activeClasses.map(cls => cls.id)).limit(1);
      if (enrollmentError) throw new Error("Could not check course enrollment.");
      canTrackProgress = Boolean(enrollment?.length);
    }
  }
  const modules = (course.course_modules ?? []).slice().sort((a, b) => a.position - b.position);
  const importedVideos = new Map<string,string>();
  let youtubeInitialPercents:Record<string,number> = {};
  const { data: sources, error: sourceError } = await db.from("youtube_lesson_sources")
    .select("lesson_id,video_id").eq("college_id",profile.college_id)
    .eq("course_id",courseId);
  // Until SQL 045 is installed, existing ordinary course pages stay usable.
  if(sourceError && sourceError.code!=="PGRST205" && sourceError.code!=="42P01")
    throw new Error("Could not load course video sources.");
  for(const link of sources??[])importedVideos.set(link.lesson_id,link.video_id);
  if(profile.role==="student"&&importedVideos.size){
    const {data:watchRows,error:watchError}=await db.from("youtube_watch_progress")
      .select("lesson_id,percent").eq("college_id",profile.college_id)
      .eq("student_id",profile.id).eq("course_id",courseId);
    if(watchError)throw new Error("Could not load tracked YouTube video progress.");
    youtubeInitialPercents=Object.fromEntries((watchRows??[]).map(item=>[item.lesson_id,Number(item.percent)]));
  }
  const visibleModules: LearningModule[] = modules.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    lessons: (module.course_lessons ?? [])
      .filter((lesson) => profile.role !== "student" || lesson.is_published)
      .sort((a, b) => a.position - b.position)
      .map(lesson=>({...lesson,youtubeVideoId:importedVideos.get(lesson.id)??null})),
  }));
  const visibleLessonIds = visibleModules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
  const progressResult = profile.role === "student" && visibleLessonIds.length
    ? await db.from("lesson_progress").select("lesson_id").eq("student_id", profile.id).in("lesson_id", visibleLessonIds)
    : { data: [], error: null };
  if (progressResult.error) {
    console.error("Unable to load course progress", progressResult.error);
    throw new Error("Unable to load your course progress.");
  }
  const completed = new Set((progressResult.data ?? []).map((item) => item.lesson_id));
  const totalLessons = visibleLessonIds.length;
  const totalDuration = visibleModules.reduce((total, module) => total + module.lessons.reduce((subtotal, lesson) => subtotal + (lesson.duration_minutes ?? 0), 0), 0);

  return (
    <>
      <LearningHubHeader
        active="courses"
        title={course.title}
        description={`${subject?.code ?? ""}${subject?.code ? " · " : ""}${subject?.name ?? "Course"} · ${modules.length} chapters · ${totalLessons} lectures`}
        canAuthor={profile.role === "faculty" || profile.role === "admin"}
      />
      <section className="surface mb-4 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {course.description || "Follow each chapter at your own pace. Your completed lectures are saved to your learning record."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {subject?.code ? <span className="status-pill green">{subject.code}</span> : null}
              <span className="status-pill">{modules.length} {modules.length === 1 ? "chapter" : "chapters"}</span>
              <span className="status-pill">{totalLessons} {totalLessons === 1 ? "lecture" : "lectures"}</span>
              {totalDuration > 0 ? <span className="status-pill">{totalDuration} min total</span> : null}
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-[420px] sm:shrink-0">
            <AISummarizeButton resourceType="course" resourceId={courseId}/>
            <AIResourceAssistant resourceType="course" resourceId={courseId} compact />
          </div>
        </div>
      </section>
      {profile.role === "student" ? <div className="mb-4 flex gap-2"><Link className="btn-secondary" href="/certificates">My course certificates</Link><Link className="btn-secondary" href="/library">Study materials library</Link></div> : <div className="mb-4 flex gap-2"><Link className="btn-secondary" href={"/faculty/progress?course="+courseId}>See student completion report</Link><Link className="btn-secondary" href="/library">Upload course materials</Link></div>}
      {profile.role === "student" && !canTrackProgress ? <section className="surface p-4 mb-4 text-sm text-[var(--muted)]">You can explore the lessons, but completion tracking and course certificates require joining an active class for this subject. <Link className="font-semibold underline" href="/join">Join your subject class</Link>, then return to mark lectures complete.</section> : null}
      <CourseLearningViewer
        modules={visibleModules}
        initialCompletedLessonIds={[...completed]}
        isStudent={profile.role === "student" && canTrackProgress}
        youtubeInitialPercents={youtubeInitialPercents}
      />
    </>
  );
}
