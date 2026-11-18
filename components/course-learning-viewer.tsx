"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Circle, Clock3, ExternalLink, Play, PlayCircle } from "lucide-react";
import { LessonCompleteButton } from "@/components/lesson-complete-button";
import { AIResourceAssistant } from "@/components/ai-resource-assistant";

export type LearningLesson = {
  id: string;
  title: string;
  plain_text: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  is_published: boolean;
};

export type LearningModule = {
  id: string;
  title: string;
  description: string | null;
  lessons: LearningLesson[];
};

function getYoutubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    let videoId: string | null = null;
    if (url.hostname === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") {
      videoId = url.searchParams.get("v");
      if (!videoId && url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] ?? null;
    }
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : null;
  } catch {
    return null;
  }
}

function getVimeoEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["vimeo.com", "www.vimeo.com"].includes(url.hostname)) return null;
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return videoId && /^\d+$/.test(videoId) ? `https://player.vimeo.com/video/${videoId}` : null;
  } catch {
    return null;
  }
}

function getYoutubeVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    let videoId: string | null = null;
    if (url.hostname === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") {
      videoId = url.searchParams.get("v");
      if (!videoId && url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] ?? null;
    }
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function CourseLearningViewer({
  modules,
  initialCompletedLessonIds,
  isStudent,
}: {
  modules: LearningModule[];
  initialCompletedLessonIds: string[];
  isStudent: boolean;
}) {
  const lessons = useMemo(() => modules.flatMap((module) => module.lessons.map((lesson) => ({
    ...lesson,
    moduleId: module.id,
    moduleTitle: module.title,
  }))), [modules]);
  const initialLesson = lessons.find((lesson) => !initialCompletedLessonIds.includes(lesson.id)) ?? lessons[0];
  const [selectedLessonId, setSelectedLessonId] = useState(initialLesson?.id ?? "");
  const [completedIds, setCompletedIds] = useState(() => new Set(initialCompletedLessonIds));
  const [videoLoaded, setVideoLoaded] = useState(false);
  const playerRef = useRef<HTMLElement>(null);
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const totalLessons = lessons.length;
  const completedCount = lessons.filter((lesson) => completedIds.has(lesson.id)).length;
  const videoUrl = selectedLesson?.video_url
    ? getYoutubeEmbedUrl(selectedLesson.video_url) ?? getVimeoEmbedUrl(selectedLesson.video_url)
    : null;
  const youtubeVideoId = selectedLesson?.video_url ? getYoutubeVideoId(selectedLesson.video_url) : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    setVideoLoaded(false);
  }, [selectedLessonId]);

  function selectLesson(lessonId: string) {
    setSelectedLessonId(lessonId);
    setVideoLoaded(false);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.requestAnimationFrame(() => {
        playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  if (!lessons.length) {
    return (
      <div className="surface">
        <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]">
            <BookOpen size={21} />
          </div>
          <h2 className="mt-4 text-sm font-semibold">No lessons are available yet</h2>
          <p className="mt-1.5 max-w-sm text-xs leading-6 text-[var(--muted)]">
            Published lectures and chapters will appear here as your instructor adds them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section ref={playerRef} id="course-player" className="surface min-w-0 scroll-mt-20 overflow-hidden">
        <div className="relative aspect-video bg-[#111815]">
          {youtubeVideoId && !videoLoaded ? (
            <button
              type="button"
              className="group absolute inset-0 h-full w-full overflow-hidden text-left"
              onClick={() => setVideoLoaded(true)}
              aria-label={`Play ${selectedLesson?.title ?? "lesson"}`}
            >
              <img
                src={`https://i.ytimg.com/vi/${youtubeVideoId}/hq720.jpg`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.015]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/10" />
              <span className="absolute top-1/2 left-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#171b19] shadow-xl transition-transform group-hover:scale-105 sm:h-16 sm:w-16">
                <Play size={22} fill="currentColor" />
              </span>
            </button>
          ) : videoUrl && selectedLesson ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={videoUrl}
              title={selectedLesson.title}
              loading="eager"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : selectedLesson?.video_url ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <PlayCircle size={36} className="text-white/75" />
              <p className="max-w-sm text-sm">This video link cannot be embedded. You can still open it directly.</p>
              <a className="btn-secondary !border-white/20 !bg-white/10 !text-white" href={selectedLesson.video_url} target="_blank" rel="noreferrer">
                Open video
              </a>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                <Play size={19} />
              </div>
              <span className="text-sm font-medium">Lecture notes</span>
              <span className="text-xs text-white/60">Read the lesson content below</span>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
            <span>{selectedLesson?.moduleTitle}</span>
            {selectedLesson?.duration_minutes ? <><span aria-hidden="true">·</span><span>{selectedLesson.duration_minutes} min</span></> : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-.035em]">{selectedLesson?.title}</h2>
          {selectedLesson?.plain_text ? (
            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">{selectedLesson.plain_text}</div>
          ) : null}
          {selectedLesson ? (
            <div className="mt-5">
              <AIResourceAssistant resourceType="lesson" resourceId={selectedLesson.id} compact />
            </div>
          ) : null}
          {selectedLesson?.video_url ? (
            <a className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--green-strong)] hover:underline" href={selectedLesson.video_url} target="_blank" rel="noreferrer">
              Open video in a new tab <ExternalLink size={13}/>
            </a>
          ) : null}
          {isStudent && selectedLesson ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <LessonCompleteButton
                key={selectedLesson.id}
                lessonId={selectedLesson.id}
                completed={completedIds.has(selectedLesson.id)}
                onComplete={() => setCompletedIds((current) => new Set(current).add(selectedLesson.id))}
              />
            </div>
          ) : null}
        </div>
      </section>

      <aside className="surface h-fit overflow-hidden">
        <div className="border-b border-[var(--line)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-[-.02em]">Course curriculum</div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{modules.length} chapters · {totalLessons} lectures</p>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]">
              <BookOpen size={16} />
            </div>
          </div>
          {isStudent ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--muted)]">
                <span>Your progress</span>
                <span>{completedCount} of {totalLessons} lectures</span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
                role="progressbar"
                aria-label="Course progress"
                aria-valuemin={0}
                aria-valuemax={totalLessons}
                aria-valuenow={completedCount}
              >
                <div className="h-full rounded-full bg-[var(--green-strong)] transition-[width] duration-200" style={{ width: `${totalLessons ? (completedCount / totalLessons) * 100 : 0}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="max-h-[min(68vh,720px)] space-y-5 overflow-y-auto p-3">
          {modules.map((module, moduleIndex) => {
            const moduleLessons = lessons.filter((lesson) => lesson.moduleId === module.id);
            const moduleCompleted = moduleLessons.filter((lesson) => completedIds.has(lesson.id)).length;
            return (
              <section key={module.id}>
                <div className="flex items-start justify-between gap-3 px-2 pb-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Chapter {moduleIndex + 1}</div>
                    <h3 className="mt-1 truncate text-xs font-semibold">{module.title}</h3>
                  </div>
                  {isStudent ? <span className="shrink-0 text-[10px] text-[var(--muted)]">{moduleCompleted}/{moduleLessons.length}</span> : null}
                </div>
                <div className="space-y-1">
                  {moduleLessons.map((lesson, lessonIndex) => {
                    const selected = lesson.id === selectedLessonId;
                    const completed = completedIds.has(lesson.id);
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => selectLesson(lesson.id)}
                        className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors ${
                          selected ? "bg-[var(--green-soft)] text-[var(--green-strong)]" : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">
                          {completed ? <Check size={15} /> : selected ? <PlayCircle size={15} /> : <Circle size={15} className="text-[var(--muted)]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-5">{lessonIndex + 1}. {lesson.title}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                            {lesson.video_url ? <Play size={11} /> : <BookOpen size={11} />}
                            {lesson.duration_minutes ? <><Clock3 size={11} />{lesson.duration_minutes} min</> : lesson.video_url ? "Video lecture" : "Reading"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="border-t border-[var(--line)] p-4">
          <Link className="text-xs font-semibold text-[var(--green-strong)] hover:underline" href="/courses">Back to course library</Link>
        </div>
      </aside>
    </div>
  );
}
