"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, BookOpen, ClipboardCheck, FileUp, Megaphone, Plus, RadioTower, Trash2, Users, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { QuizAuthoringForm } from "@/components/quiz-authoring-form";

type ClassItem = {
  id: string;
  display_name: string;
  section: string;
  subjects?: { id: string; name: string; code: string }[] | null;
  students: { id: string; full_name: string }[];
};
type Subject = { id: string; name: string; code: string };
type StudioTab = "stream" | "course" | "quiz";
type CourseLessonDraft = { id: string; title: string; content: string; video: string };
type CourseChapterDraft = { id: string; title: string; lessons: CourseLessonDraft[] };

const input = "input-base";

export function FacultyLearningStudio({ classes, subjects, initialTab = "stream" }: { classes: ClassItem[]; subjects: Subject[]; initialTab?: StudioTab }) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [stream, setStream] = useState({ classId: "", title: "", body: "", type: "announcement" });
  const [visibility, setVisibility] = useState<"class" | "selected_students">("class");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [course, setCourse] = useState({ subjectId: "", title: "", description: "" });
  const [chapters, setChapters] = useState<CourseChapterDraft[]>([
    {
      id: crypto.randomUUID(),
      title: "",
      lessons: [{ id: crypto.randomUUID(), title: "", content: "", video: "" }],
    },
  ]);

  async function saveStream(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData();
    form.set("class_id", stream.classId);
    form.set("title", stream.title);
    form.set("body", stream.body);
    form.set("post_type", stream.type);
    form.set("visibility", visibility);
    form.set("student_ids", JSON.stringify(studentIds));
    form.set("pinned", String(pinned));
    if (attachment) form.set("attachment", attachment);
    try {
      const response = await fetch("/api/stream/posts", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        toast.error(result.error ?? "Could not publish the class post.");
        return;
      }
      toast.success("Stream post published.");
      setStream({ classId: "", title: "", body: "", type: "announcement" });
      setVisibility("class");
      setStudentIds([]);
      setPinned(false);
      setAttachment(null);
      router.refresh();
    } catch {
      toast.error("Could not reach the class stream service.");
    } finally {
      setBusy(false);
    }
  }

  function moveChapter(index: number, direction: -1 | 1) {
    setChapters((current) => {
      const to = index + direction;
      if (to < 0 || to >= current.length) return current;
      const next = current.slice();
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function moveLecture(chapterId: string, index: number, direction: -1 | 1) {
    setChapters((current) => current.map((chapter) => {
      if (chapter.id !== chapterId) return chapter;
      const to = index + direction;
      if (to < 0 || to >= chapter.lessons.length) return chapter;
      const lessons = chapter.lessons.slice();
      [lessons[index], lessons[to]] = [lessons[to], lessons[index]];
      return { ...chapter, lessons };
    }));
  }

  // Pointer users may drag chapter/lecture handles; the existing arrow
  // controls remain a keyboard-accessible alternative and work on touch.
  function reorderChapters(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setChapters((current) => {
      const from=current.findIndex((chapter)=>chapter.id===sourceId);
      const to=current.findIndex((chapter)=>chapter.id===targetId);
      if(from<0||to<0)return current;
      const next=current.slice();
      const [moving]=next.splice(from,1);
      next.splice(to,0,moving);
      return next;
    });
  }

  function reorderLectures(chapterId: string, sourceId: string, targetId: string) {
    if(sourceId===targetId)return;
    setChapters((current)=>current.map((chapter)=>{
      if(chapter.id!==chapterId)return chapter;
      const from=chapter.lessons.findIndex((lesson)=>lesson.id===sourceId);
      const to=chapter.lessons.findIndex((lesson)=>lesson.id===targetId);
      if(from<0||to<0)return chapter;
      const lessons=chapter.lessons.slice();
      const [moving]=lessons.splice(from,1);
      lessons.splice(to,0,moving);
      return {...chapter,lessons};
    }));
  }

  async function saveCourse(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    if (!chapters.length || chapters.some((chapter) => !chapter.title.trim() || !chapter.lessons.length || chapter.lessons.some((lesson) => !lesson.title.trim()))) {
      toast.error("Add a title for every chapter and lecture.");
      setBusy(false);
      return;
    }
    const db = createClient();
    const { data: user } = await db.auth.getUser();
    const { data: profile } = user.user
      ? await db.from("profiles").select("college_id").eq("id", user.user.id).single()
      : { data: null };
    const { data: created, error } = await db.from("courses").insert({
      college_id: profile?.college_id,
      subject_id: course.subjectId,
      title: course.title.trim(),
      description: course.description.trim(),
      status: "archived",
    }).select("id").single();
    let failure = error;
    if (!failure && created) {
      for (let modulePosition = 0; modulePosition < chapters.length && !failure; modulePosition += 1) {
        const chapter = chapters[modulePosition];
        const { data: module, error: moduleError } = await db.from("course_modules").insert({
          college_id: profile?.college_id,
          course_id: created.id,
          title: chapter.title.trim(),
          description: null,
          position: modulePosition,
        }).select("id").single();
        failure = moduleError;
        if (!failure && module) {
          const lessonRows = chapter.lessons.map((lesson, lessonPosition) => ({
            college_id: profile?.college_id,
            module_id: module.id,
            title: lesson.title.trim(),
            plain_text: lesson.content.trim(),
            video_url: lesson.video.trim() || null,
            is_published: true,
            position: lessonPosition,
          }));
          const { error: lessonError } = await db.from("course_lessons").insert(lessonRows);
          failure = lessonError;
        }
      }
      if (!failure) {
        const { error: publishError } = await db.from("courses").update({ status: "active" }).eq("id", created.id);
        failure = publishError;
      }
      if (failure) {
        const { error: cleanupError } = await db.from("courses").delete().eq("id", created.id);
        if (cleanupError) console.error("Unable to remove a partially created course", cleanupError);
      }
    }
    setBusy(false);
    if (failure) {
      toast.error("Could not create and publish the complete course.");
    } else {
      toast.success("Course published.");
      setCourse({ subjectId: "", title: "", description: "" });
      setChapters([{ id: crypto.randomUUID(), title: "", lessons: [{ id: crypto.randomUUID(), title: "", content: "", video: "" }] }]);
      router.refresh();
    }
  }

  const tabs = [
    { id: "stream", label: "Class stream", hint: "Share an update", icon: RadioTower },
    { id: "course", label: "Course", hint: "Build chapters & lectures", icon: BookOpen },
    { id: "quiz", label: "Assessment", hint: "Create a quiz or exam", icon: ClipboardCheck },
  ] as const;
  const selectedClass = classes.find((item) => item.id === stream.classId);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Create learning content">
        {tabs.map(({ id, label, hint, icon: Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => setTab(id)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                selected ? "border-[var(--green)] bg-[var(--green-soft)]" : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-[var(--surface)] text-[var(--green-strong)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                <Icon size={17} />
              </span>
              <span>
                <span className="block text-xs font-semibold">{label}</span>
                <span className="mt-1 block text-[10px] text-[var(--muted)]">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        {tab === "stream" ? (
          <form onSubmit={saveStream} className="surface min-w-0 space-y-5 p-5 sm:p-6">
            <div className="flex items-start gap-3 border-b border-[var(--line)] pb-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><Megaphone size={18} /></span>
              <div>
                <h2 className="text-base font-semibold tracking-[-.025em]">Start a class conversation</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Share an announcement, a learning resource, or a question with the right learners.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Classroom
                <select className={`${input} mt-2`} required value={stream.classId} onChange={(event) => { setStream({ ...stream, classId: event.target.value }); setStudentIds([]); }}>
                  <option value="">Choose a classroom</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.section}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold">Post type
                <select className={`${input} mt-2`} value={stream.type} onChange={(event) => setStream({ ...stream, type: event.target.value })}>
                  <option value="announcement">Announcement</option>
                  <option value="material">Learning resource</option>
                  <option value="question">Question</option>
                  <option value="assignment">Assignment update</option>
                  <option value="quiz">Assessment update</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold">Headline
              <input className={`${input} mt-2`} required minLength={2} maxLength={180} placeholder="Give your post a clear title" value={stream.title} onChange={(event) => setStream({ ...stream, title: event.target.value })} />
            </label>
            <label className="block text-xs font-semibold">Message
              <textarea className={`${input} mt-2 min-h-36 resize-y`} required maxLength={10000} placeholder="Add context, instructions, or a helpful note for your class…" value={stream.body} onChange={(event) => setStream({ ...stream, body: event.target.value })} />
              <span className="mt-1.5 block text-[10px] font-normal text-[var(--muted)]">Visible to the classroom members you select below.</span>
            </label>
            <div className="grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Who can see this?
                <select className={`${input} mt-2`} value={visibility} onChange={(event) => { setVisibility(event.target.value as "class" | "selected_students"); setStudentIds([]); }}>
                  <option value="class">All enrolled students</option>
                  <option value="selected_students">Selected students only</option>
                </select>
              </label>
              <label className="block text-xs font-semibold">Attach a resource
                <span className="relative mt-2 flex min-h-11 items-center gap-2 overflow-hidden rounded-xl border border-dashed border-[var(--line)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] focus-within:ring-2 focus-within:ring-[var(--green)]">
                  <FileUp size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{attachment?.name ?? "Choose a file"}</span>
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="file" aria-label="Choose a class resource file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.pptx" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
                </span>
                <span className="mt-1 block text-[10px] font-normal text-[var(--muted)]">PDF, image, DOCX or PPTX · up to 30 MB</span>
              </label>
            </div>
            {visibility === "selected_students" ? (
              <fieldset className="rounded-2xl border border-[var(--line)] p-4">
                <legend className="px-1 text-xs font-semibold">Choose recipients <span className="font-normal text-[var(--muted)]">· {studentIds.length} selected</span></legend>
                {selectedClass?.students.length ? (
                  <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                    {selectedClass.students.map((student) => (
                      <label key={student.id} className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs hover:bg-[var(--surface-2)]">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--green-strong)]" checked={studentIds.includes(student.id)} onChange={(event) => setStudentIds((ids) => event.target.checked ? [...ids, student.id] : ids.filter((id) => id !== student.id))} />
                        <span className="truncate">{student.full_name}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs text-[var(--muted)]">{stream.classId ? "No active enrolled students in this class." : "Choose a classroom to see its active students."}</p>}
              </fieldset>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex min-h-10 items-center gap-2 text-xs font-medium">
                <input type="checkbox" className="h-4 w-4 accent-[var(--green-strong)]" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
                Pin this post for the class
              </label>
              <button className="btn-primary" disabled={busy || !classes.length || (visibility === "selected_students" && !studentIds.length)}>
                <RadioTower size={15} />{busy ? "Publishing…" : "Publish to stream"}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "course" ? (
          <form onSubmit={saveCourse} className="surface min-w-0 space-y-5 p-5 sm:p-6">
            <div className="flex items-start gap-3 border-b border-[var(--line)] pb-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BookOpen size={18} /></span>
              <div>
                <h2 className="text-base font-semibold tracking-[-.025em]">Build a complete course</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Organize learning by subject, chapter, and multiple lecture episodes. Add YouTube links when a lecture has video.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Subject
                <select className={`${input} mt-2`} required value={course.subjectId} onChange={(event) => setCourse({ ...course, subjectId: event.target.value })}>
                  <option value="">Choose a subject</option>
                  {subjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold">Course title
                <input className={`${input} mt-2`} required minLength={2} maxLength={180} placeholder="e.g. Introduction to Biology" value={course.title} onChange={(event) => setCourse({ ...course, title: event.target.value })} />
              </label>
            </div>
            <label className="block text-xs font-semibold">Course overview
              <textarea className={`${input} mt-2 min-h-20 resize-y`} maxLength={5000} placeholder="What will students learn in this course?" value={course.description} onChange={(event) => setCourse({ ...course, description: event.target.value })} />
            </label>
            <div className="space-y-4">
              {chapters.map((chapter, chapterIndex) => (
                <section key={chapter.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4"
                  onDragOver={(event)=>{if(event.dataTransfer.types.includes("text/plain"))event.preventDefault();}}
                  onDrop={(event)=>{
                    const value=event.dataTransfer.getData("text/plain");
                    if(!value.startsWith("campus-chapter:"))return;
                    event.preventDefault();
                    reorderChapters(value.slice("campus-chapter:".length),chapter.id);
                  }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface)] text-[var(--green-strong)]">{chapterIndex + 1}</span>Chapter {chapterIndex + 1}</div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span draggable title="Drag chapter to reorder" role="img" aria-label={"Drag chapter " + (chapterIndex + 1)}
                        className="cursor-grab rounded-lg p-2 text-[var(--muted)]"
                        onDragStart={(event)=>{event.dataTransfer.setData("text/plain","campus-chapter:"+chapter.id);event.dataTransfer.effectAllowed="move";}}
                        ><GripVertical size={16}/></span>
                      <button type="button" className="btn-secondary !p-2" disabled={chapterIndex === 0} onClick={() => moveChapter(chapterIndex, -1)} aria-label={"Move chapter " + (chapterIndex + 1) + " up"}><ArrowUp size={14}/></button>
                      <button type="button" className="btn-secondary !p-2" disabled={chapterIndex === chapters.length - 1} onClick={() => moveChapter(chapterIndex, 1)} aria-label={"Move chapter " + (chapterIndex + 1) + " down"}><ArrowDown size={14}/></button>
                      {chapters.length > 1 && <button type="button" className="btn-secondary !px-2.5 !py-2 text-[10px]" onClick={() => setChapters((current) => current.filter((item) => item.id !== chapter.id))}><Trash2 size={13}/>Remove</button>}
                    </div>
                  </div>
                  <label className="block text-xs font-semibold">Chapter title
                    <input className={`${input} mt-2 bg-[var(--surface)]`} required maxLength={180} placeholder="e.g. Fundamentals" value={chapter.title} onChange={(event) => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, title: event.target.value } : item))} />
                  </label>
                  <div className="mt-4 space-y-3">
                    {chapter.lessons.map((lesson, lessonIndex) => (
                      <div key={lesson.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
                        onDragOver={(event)=>{if(event.dataTransfer.types.includes("text/plain"))event.preventDefault();}}
                        onDrop={(event)=>{
                          const value=event.dataTransfer.getData("text/plain");
                          const prefix="campus-lecture:"+chapter.id+":";
                          if(!value.startsWith(prefix))return;
                          event.preventDefault();event.stopPropagation();
                          reorderLectures(chapter.id,value.slice(prefix.length),lesson.id);
                        }}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold">Lecture {lessonIndex + 1}</div>
                          <div className="flex items-center gap-1">
                            <span draggable title="Drag lecture to reorder" role="img" aria-label={"Drag lecture " + (lessonIndex + 1)}
                              className="cursor-grab rounded-lg p-2 text-[var(--muted)]"
                              onDragStart={(event)=>{event.dataTransfer.setData("text/plain","campus-lecture:"+chapter.id+":"+lesson.id);event.dataTransfer.effectAllowed="move";}}
                            ><GripVertical size={16}/></span>
                            <button type="button" disabled={lessonIndex === 0} className="btn-secondary !p-2" aria-label={"Move lecture " + (lessonIndex + 1) + " up"} onClick={() => moveLecture(chapter.id, lessonIndex, -1)}><ArrowUp size={14}/></button>
                            <button type="button" disabled={lessonIndex === chapter.lessons.length - 1} className="btn-secondary !p-2" aria-label={"Move lecture " + (lessonIndex + 1) + " down"} onClick={() => moveLecture(chapter.id, lessonIndex, 1)}><ArrowDown size={14}/></button>
                            {chapter.lessons.length > 1 && <button type="button" className="btn-secondary !p-2" aria-label="Remove lecture" onClick={() => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, lessons: item.lessons.filter((entry) => entry.id !== lesson.id) } : item))}><Trash2 size={14}/></button>}
                          </div>
                        </div>
                        <label className="block text-xs font-semibold">Lecture title
                          <input className={`${input} mt-2`} required maxLength={180} placeholder="e.g. Introduction to data structures" value={lesson.title} onChange={(event) => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, lessons: item.lessons.map((entry) => entry.id === lesson.id ? { ...entry, title: event.target.value } : entry) } : item))} />
                        </label>
                        <label className="mt-3 block text-xs font-semibold">Lecture notes
                          <textarea className={`${input} mt-2 min-h-24 resize-y`} maxLength={20000} placeholder="Write the key ideas students should remember…" value={lesson.content} onChange={(event) => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, lessons: item.lessons.map((entry) => entry.id === lesson.id ? { ...entry, content: event.target.value } : entry) } : item))} />
                        </label>
                        <label className="mt-3 block text-xs font-semibold">YouTube video link <span className="font-normal text-[var(--muted)]">· optional</span>
                          <input className={`${input} mt-2`} type="url" maxLength={1000} placeholder="https://www.youtube.com/watch?v=…" value={lesson.video} onChange={(event) => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, lessons: item.lessons.map((entry) => entry.id === lesson.id ? { ...entry, video: event.target.value } : entry) } : item))} />
                        </label>
                      </div>
                    ))}
                    <button type="button" className="btn-secondary w-full" onClick={() => setChapters((current) => current.map((item) => item.id === chapter.id ? { ...item, lessons: [...item.lessons, { id: crypto.randomUUID(), title: "", content: "", video: "" }] } : item))}><Plus size={14}/>Add lecture to this chapter</button>
                  </div>
                </section>
              ))}
              <button type="button" className="btn-secondary w-full" onClick={() => setChapters((current) => [...current, { id: crypto.randomUUID(), title: "", lessons: [{ id: crypto.randomUUID(), title: "", content: "", video: "" }] }])}><Plus size={14}/>Add another chapter</button>
            </div>
            <div className="flex justify-end border-t border-[var(--line)] pt-4">
              <button className="btn-primary" disabled={busy || !subjects.length}>
                <BookOpen size={15} />{busy ? "Publishing…" : "Publish course"}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "quiz" ? <QuizAuthoringForm classes={classes} /> : null}

        <aside className="surface p-5">
          <div className="eyebrow">Good to know</div>
          <div className="mt-4 space-y-4">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><Users size={15} /></span>
              <div><h3 className="text-xs font-semibold">Share with the right class</h3><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Posts and course materials are only visible to authorized members of their class or subject.</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BookOpen size={15} /></span>
              <div><h3 className="text-xs font-semibold">Teach in chapters</h3><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Add as many chapters and lecture episodes as your curriculum needs.</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><ClipboardCheck size={15} /></span>
              <div><h3 className="text-xs font-semibold">Assess understanding</h3><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Save a draft while preparing; publish when the schedule and grading are ready.</p></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
