import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { QuizRunner } from "@/components/quiz-runner";
import { QuizGradeForm } from "@/components/quiz-grade-form";
import { ArrowLeft, Users } from "lucide-react";
import { LearningHubHeader } from "@/components/learning-hub-header";

type QuizOption = string | { label?: string; value?: string };

type QuizQuestion = {
  id: string;
  position: number;
  question_type: string;
  prompt: string;
  options: QuizOption[];
  marks: number;
};

type QuizClass = {
  display_name: string | null;
  section: string;
  subjects: { name: string } | { name: string }[] | null;
};

type QuizDetailRow = {
  id: string;
  title: string;
  description: string | null;
  opens_at: string | null;
  closes_at: string | null;
  duration_minutes: number | null;
  max_marks: number;
  attempts_allowed: number;
  show_score_after_submit: boolean;
  status: string;
  class_id: string;
  classes: QuizClass | QuizClass[] | null;
};

type QuizAttempt = {
  id: string;
  attempt_number: number;
  status: string;
  score: number | null;
  submitted_at: string | null;
  released_at: string | null;
  answers?: Record<string, string | string[]>;
  question_scores?: Record<string, number>;
  evaluation_feedback?: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const db = await createClient();

  const { data: quizRaw, error: quizError } = await db
    .from("quizzes")
    .select("id,title,description,opens_at,closes_at,duration_minutes,max_marks,attempts_allowed,show_score_after_submit,status,class_id,classes(display_name,section,subjects(name))")
    .eq("id", id)
    .maybeSingle();

  if (quizError) {
    console.error("Unable to load assessment", quizError);
    throw new Error("Unable to load assessment.");
  }
  if (!quizRaw) {
    notFound();
  }
  const quiz = quizRaw as QuizDetailRow;
  const classroom = Array.isArray(quiz.classes) ? quiz.classes[0] : quiz.classes;
  const subject = Array.isArray(classroom?.subjects) ? classroom.subjects[0] : classroom?.subjects;

  const now = new Date().getTime();
  const opensAt = quiz.opens_at ? new Date(quiz.opens_at).getTime() : null;
  const closesAt = quiz.closes_at ? new Date(quiz.closes_at).getTime() : null;
  const isStarted = opensAt === null || opensAt <= now;
  const isExpired = closesAt !== null && closesAt <= now;
  const isOpen = quiz.status === "published" && isStarted && !isExpired;

  const { data: questionsRaw, error: questionsError } = await db
    .from("quiz_questions")
    .select("id,position,question_type,prompt,options,marks")
    .eq("quiz_id", id)
    .order("position", { ascending: true });
  if (questionsError) {
    console.error("Unable to load quiz questions", questionsError);
    throw new Error("Unable to load assessment questions.");
  }

  const questions = (questionsRaw ?? []) as QuizQuestion[];

  const isStudent = profile.role === "student";

  const attemptsResult = isStudent
    ? await db.rpc("get_my_quiz_attempts", { _quiz_id: id })
    : await db
        .from("quiz_attempts")
        .select("id,attempt_number,status,score,submitted_at,released_at,answers,question_scores,evaluation_feedback,profiles!quiz_attempts_college_id_student_id_fkey(full_name,email)")
        .eq("quiz_id", id)
        .order("submitted_at", { ascending: false });
  if (attemptsResult.error) {
    console.error("Unable to load quiz attempts", {
      code: attemptsResult.error.code,
      message: attemptsResult.error.message,
      details: attemptsResult.error.details,
    });
    const developmentDetail = process.env.NODE_ENV === "development"
      ? ` (${attemptsResult.error.code}: ${attemptsResult.error.message})`
      : "";
    throw new Error(`Unable to load assessment attempts${developmentDetail}.`);
  }

  const attempts = (attemptsResult.data ?? []) as QuizAttempt[];
  const attemptsRemaining = isStudent ? Math.max(0, quiz.attempts_allowed - attempts.length) : 0;
  const { data: releasedResults, error: releasedResultsError } = isStudent && attempts.length
    ? await db.from("quiz_attempts")
        .select("id,evaluation_feedback")
        .eq("quiz_id", id)
        .eq("student_id", profile.id)
        .not("released_at", "is", null)
    : { data: [], error: null };
  if (releasedResultsError) {
    console.error("Unable to load released assessment feedback", releasedResultsError);
    throw new Error("Unable to load released assessment feedback.");
  }
  const feedbackByAttempt = new Map((releasedResults ?? []).map((result) => [result.id, result.evaluation_feedback]));

  return (
    <>
      <div className="mb-4">
        <Link href="/quizzes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={14} /> Back to assessments
        </Link>
      </div>
      <LearningHubHeader
        active="assessments"
        title={quiz.title}
        description={`${subject?.name ?? "Class"} · ${classroom?.display_name ?? ""} · ${quiz.max_marks} total marks`}
        canAuthor={!isStudent}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {isStudent ? (
            <div className="space-y-4">
              {attempts.length > 0 && (
                <div className="surface overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold">Your submissions</h3>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{attempts.length} {attempts.length === 1 ? "attempt recorded" : "attempts recorded"}</p>
                    </div>
                    <span className="status-pill">{attemptsRemaining} attempts left</span>
                  </div>
                  <div className="divide-y divide-[var(--line)] px-5">
                    {attempts.map((att) => {
                      const showScore = Boolean(quiz.show_score_after_submit || att.released_at);
                      return (
                        <div key={att.id}>
                          <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                            <div>
                              <span className="text-xs font-semibold">Attempt {att.attempt_number}</span>
                              <div className="mt-1 text-[10px] text-[var(--muted)]">
                                Submitted {att.submitted_at ? format(new Date(att.submitted_at), "dd MMM yyyy · h:mm a") : "In progress"}
                              </div>
                            </div>
                            <div className="text-right">
                              {showScore && att.score !== null ? (
                                <span className="font-semibold text-sm tabular-nums text-[var(--green-strong)]">
                                  {att.score} / {quiz.max_marks} marks
                                </span>
                              ) : (
                                <span className="status-pill green capitalize">{att.status}</span>
                              )}
                            </div>
                          </div>
                          {feedbackByAttempt.get(att.id) ? (
                            <p className="mb-3 rounded-lg bg-[var(--surface-2)] p-3 text-xs leading-5">
                              {feedbackByAttempt.get(att.id)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isOpen && attemptsRemaining > 0 ? (
                <QuizRunner
                  quizId={quiz.id}
                  questions={questions}
                  attemptsRemaining={attemptsRemaining}
                  isOpen={isOpen}
                />
              ) : attempts.length === 0 ? (
                <div className="surface p-6">
                  <EmptyState
                    title={isExpired ? "Assessment closed" : "Assessment not currently open"}
                    description={
                      isExpired
                        ? "The deadline for this assessment has passed."
                        : "This assessment will become available once its scheduled window opens."
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <section className="surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4 sm:px-6">
                  <div><h2 className="text-sm font-semibold">Assessment preview</h2><p className="mt-1 text-[10px] text-[var(--muted)]">{questions.length} questions</p></div>
                  <span className="status-pill green">{quiz.max_marks} marks</span>
                </div>
                {questions.length ? (
                  <div className="space-y-2 p-4 sm:p-5">
                    {questions.map((q, i) => (
                      <div key={q.id} className="rounded-xl border border-[var(--line)] p-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
                          <span>Q{i + 1} · {q.question_type.replaceAll("_", " ")}</span>
                          <span>{q.marks} marks</span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{q.prompt}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="No questions yet"
                      description="No questions have been configured for this quiz."
                    />
                  </div>
                )}
              </section>

              <section className="surface p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={16} /> Student attempts ({attempts.length})
                </div>
                {attempts.length ? (
                  <div className="mt-4 divide-y divide-[var(--line)]">
                    {attempts.map((att) => {
                      const student = Array.isArray(att.profiles) ? att.profiles[0] : att.profiles;
                      return (
                      <div key={att.id}>
                        <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                          <div>
                            <div className="text-xs font-semibold">{student?.full_name ?? "Student"}</div>
                            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                              Attempt {att.attempt_number} · {att.submitted_at ? format(new Date(att.submitted_at), "dd MMM, h:mm a") : "—"}
                            </div>
                          </div>
                          <div className="text-right text-xs font-semibold">
                            {att.score !== null ? `${att.score} / ${quiz.max_marks} marks` : att.status}
                          </div>
                          </div>
                        {questions.length > 0 && att.released_at === null ? (
                          <QuizGradeForm
                            attemptId={att.id}
                            questions={questions
                              .filter((question) => question.question_type === "short_answer")
                              .map((question) => ({ id: question.id, prompt: question.prompt, marks: question.marks }))}
                            answers={att.answers ?? {}}
                            initialScores={att.question_scores ?? {}}
                            feedback={att.evaluation_feedback ?? null}
                          />
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="No submissions yet"
                      description="Student attempts will be shown here as they are submitted."
                    />
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface p-5">
            <h3 className="text-sm font-semibold">Assessment details</h3>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Status</span>
                <span className={`status-pill ${isOpen ? "green" : ""}`}>{quiz.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Total questions</span>
                <span className="font-semibold">{questions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Max marks</span>
                <span className="font-semibold">{quiz.max_marks}</span>
              </div>
              {quiz.duration_minutes ? (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Duration</span>
                  <span className="font-semibold">{quiz.duration_minutes} mins</span>
                </div>
              ) : null}
              {isStudent && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Attempts remaining</span>
                  <span className="font-semibold">{attemptsRemaining} of {quiz.attempts_allowed}</span>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-[var(--line)] pt-4 text-xs space-y-2">
              <div>
                <span className="text-[10px] text-[var(--muted)]">Opens at:</span>
                <div className="font-medium">{quiz.opens_at ? format(new Date(quiz.opens_at), "dd MMM yyyy · h:mm a") : "Immediately"}</div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)]">Closes at:</span>
                <div className="font-medium">{quiz.closes_at ? format(new Date(quiz.closes_at), "dd MMM yyyy · h:mm a") : "No deadline"}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
