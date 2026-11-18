"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type ClassItem = { id: string; display_name: string; section: string; subjects?: { id: string; name: string; code: string } | null };
type Subject = { id: string; name: string; code: string };

export function FacultyLearningStudio({ classes, subjects }: { classes: ClassItem[]; subjects: Subject[] }) {
  const [tab, setTab] = useState<"stream" | "course" | "quiz">("stream");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [stream, setStream] = useState({ classId: "", title: "", body: "", type: "announcement" });
  const [course, setCourse] = useState({ subjectId: "", title: "", description: "", module: "", lesson: "", content: "", video: "" });
  const [quiz, setQuiz] = useState({ classId: "", title: "", description: "", prompt: "", options: "", answer: "", marks: "1" });

  async function saveStream(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    const db = createClient();
    const { data: user } = await db.auth.getUser();
    const { data: profile } = user.user ? await db.from("profiles").select("college_id").eq("id", user.user.id).single() : { data: null };
    const { error } = await db.from("class_stream_posts").insert({
      college_id: profile?.college_id, class_id: stream.classId, author_id: user.user?.id,
      title: stream.title.trim(), body: stream.body.trim(), post_type: stream.type, published_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) toast.error("Could not publish stream post."); else { toast.success("Stream post published."); setStream({ classId: "", title: "", body: "", type: "announcement" }); router.refresh(); }
  }

  async function saveCourse(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    const db = createClient();
    const { data: user } = await db.auth.getUser();
    const { data: profile } = user.user ? await db.from("profiles").select("college_id").eq("id", user.user.id).single() : { data: null };
    const { data: created, error } = await db.from("courses").insert({ college_id: profile?.college_id, subject_id: course.subjectId, title: course.title.trim(), description: course.description.trim(), status: "active" }).select("id").single();
    if (!error && created && course.module.trim()) {
      const { data: module, error: moduleError } = await db.from("course_modules").insert({ college_id: profile?.college_id, course_id: created.id, title: course.module.trim(), position: 0 }).select("id").single();
      if (!moduleError && module && course.lesson.trim()) await db.from("course_lessons").insert({ college_id: profile?.college_id, module_id: module.id, title: course.lesson.trim(), plain_text: course.content.trim(), video_url: course.video.trim() || null, is_published: true, position: 0 });
    }
    setBusy(false);
    if (error) toast.error("Could not create the course."); else { toast.success("Course published."); setCourse({ subjectId: "", title: "", description: "", module: "", lesson: "", content: "", video: "" }); router.refresh(); }
  }

  async function saveQuiz(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    const db = createClient();
    const { data: user } = await db.auth.getUser();
    const { data: profile } = user.user ? await db.from("profiles").select("college_id").eq("id", user.user.id).single() : { data: null };
    const options = quiz.options.split("\n").map((value) => value.trim()).filter(Boolean);
    const { data: created, error } = await db.from("quizzes").insert({ college_id: profile?.college_id, class_id: quiz.classId, created_by: user.user?.id, title: quiz.title.trim(), description: quiz.description.trim(), status: "published", max_marks: Number(quiz.marks) }).select("id").single();
    if (!error && created && quiz.prompt.trim()) await db.from("quiz_questions").insert({ college_id: profile?.college_id, quiz_id: created.id, position: 0, question_type: "multiple_choice", prompt: quiz.prompt.trim(), options, answer_key: quiz.answer.trim(), marks: Number(quiz.marks) });
    setBusy(false);
    if (error) toast.error("Could not publish the assessment."); else { toast.success("Assessment published."); setQuiz({ classId: "", title: "", description: "", prompt: "", options: "", answer: "", marks: "1" }); router.refresh(); }
  }

  const input = "input w-full";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["stream", "course", "quiz"] as const).map((item) => <button key={item} type="button" className={`btn-secondary capitalize ${tab === item ? "!border-[var(--green)] !text-[var(--green-strong)]" : ""}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "stream" && <form onSubmit={saveStream} className="surface max-w-2xl space-y-3 p-5"><h2 className="font-semibold">Publish to a class stream</h2><select className={input} required value={stream.classId} onChange={(e) => setStream({ ...stream, classId: e.target.value })}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.section}</option>)}</select><select className={input} value={stream.type} onChange={(e) => setStream({ ...stream, type: e.target.value })}><option value="announcement">Announcement</option><option value="material">Learning resource</option><option value="question">Question</option></select><input className={input} required maxLength={180} placeholder="Title" value={stream.title} onChange={(e) => setStream({ ...stream, title: e.target.value })}/><textarea className={`${input} min-h-32`} required placeholder="Write an update…" value={stream.body} onChange={(e) => setStream({ ...stream, body: e.target.value })}/><button className="btn-primary" disabled={busy}>{busy ? "Publishing…" : "Publish post"}</button></form>}
      {tab === "course" && <form onSubmit={saveCourse} className="surface max-w-2xl space-y-3 p-5"><h2 className="font-semibold">Publish a course and first lesson</h2><select className={input} required value={course.subjectId} onChange={(e) => setCourse({ ...course, subjectId: e.target.value })}><option value="">Select subject</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><input className={input} required placeholder="Course title" value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })}/><textarea className={input} placeholder="Course description" value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })}/><input className={input} required placeholder="First module" value={course.module} onChange={(e) => setCourse({ ...course, module: e.target.value })}/><input className={input} required placeholder="First lesson" value={course.lesson} onChange={(e) => setCourse({ ...course, lesson: e.target.value })}/><textarea className={`${input} min-h-32`} placeholder="Lesson content" value={course.content} onChange={(e) => setCourse({ ...course, content: e.target.value })}/><input className={input} type="url" placeholder="Video link (optional)" value={course.video} onChange={(e) => setCourse({ ...course, video: e.target.value })}/><button className="btn-primary" disabled={busy}>{busy ? "Publishing…" : "Publish course"}</button></form>}
      {tab === "quiz" && <form onSubmit={saveQuiz} className="surface max-w-2xl space-y-3 p-5"><h2 className="font-semibold">Publish a multiple-choice assessment</h2><select className={input} required value={quiz.classId} onChange={(e) => setQuiz({ ...quiz, classId: e.target.value })}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.section}</option>)}</select><input className={input} required placeholder="Assessment title" value={quiz.title} onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}/><textarea className={input} placeholder="Description" value={quiz.description} onChange={(e) => setQuiz({ ...quiz, description: e.target.value })}/><textarea className={input} required placeholder="Question" value={quiz.prompt} onChange={(e) => setQuiz({ ...quiz, prompt: e.target.value })}/><textarea className={input} required placeholder="One option per line" value={quiz.options} onChange={(e) => setQuiz({ ...quiz, options: e.target.value })}/><input className={input} required placeholder="Correct option" value={quiz.answer} onChange={(e) => setQuiz({ ...quiz, answer: e.target.value })}/><input className={input} type="number" min="1" step="0.5" required placeholder="Marks" value={quiz.marks} onChange={(e) => setQuiz({ ...quiz, marks: e.target.value })}/><button className="btn-primary" disabled={busy}>{busy ? "Publishing…" : "Publish assessment"}</button></form>}
    </div>
  );
}
