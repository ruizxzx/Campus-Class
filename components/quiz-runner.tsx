"use client";
import { useEffect, useMemo, useState } from "react";
import { orderQuestions } from "@/lib/quiz-order";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Clock3, CloudCheck, Send } from "lucide-react";

type QuizOption = string | { label?: string; value?: string };

type Question = {
  id: string;
  position: number;
  question_type: string;
  prompt: string;
  options: QuizOption[];
  marks: number;
};

type Props = {
  quizId: string;
  questions: Question[];
  attemptsRemaining: number;
  isOpen: boolean;
  studentId: string;
  shuffleQuestions: boolean;
};

export function QuizRunner({ quizId, questions, attemptsRemaining, isOpen, studentId, shuffleQuestions }: Props) {
  const orderedQuestions = useMemo(() => orderQuestions(questions, shuffleQuestions,
    quizId + ":" + studentId + ":" + attemptsRemaining), [questions, shuffleQuestions, quizId, studentId, attemptsRemaining]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [timed, setTimed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isOpen || attemptsRemaining <= 0 || !questions.length) return;
    let cancelled = false;
    setSessionReady(false);
    async function start() {
      try {
        const response = await fetch("/api/quizzes/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", quiz_id: quizId }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? "Could not start the quiz.");
        if (cancelled) return;
        setAnswers(result.answers ?? {});
        setExpiry(result.expiresAt);
        setTimed(Boolean(result.timed));
        setSessionError("");
        setSessionReady(true);
      } catch (error) {
        if (!cancelled) setSessionError(error instanceof Error ? error.message : "Unable to start the quiz.");
      }
    }
    void start();
    return () => { cancelled = true; };
  }, [quizId, isOpen, attemptsRemaining, questions.length]);

  useEffect(() => {
    if (!expiry) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((Date.parse(expiry) - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiry]);

  useEffect(() => {
    if (!sessionReady || submitting) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quizzes/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", quiz_id: quizId, answers }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? "Autosave failed.");
        setSavedAt(new Date().toLocaleTimeString());
        setSaveError("");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Autosave failed. Check connection.");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [answers, sessionReady, quizId, submitting]);
  const router = useRouter();
  const answeredCount = questions.filter((question) => {
    const answer = answers[question.id];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
  }).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  if (!isOpen) {
    return (
      <div className="surface p-5 text-center text-xs text-[var(--muted)]">
        This quiz is not currently accepting submissions.
      </div>
    );
  }

  if (attemptsRemaining <= 0) {
    return (
      <div className="surface p-5 text-center text-xs text-[var(--muted)]">
        You have used all attempts allowed for this quiz.
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="surface p-5 text-center text-xs text-[var(--muted)]">
        No questions have been added to this assessment yet.
      </div>
    );
  }

  function handleSelect(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultipleSelect(questionId: string, value: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const next = current.includes(value)
        ? current.filter((selected) => selected !== value)
        : [...current, value];
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasAnswers = Object.values(answers).some((answer) =>
      Array.isArray(answer) ? answer.length > 0 : answer.trim().length > 0,
    );
    if (!sessionReady || (timed && secondsLeft === 0)) {
      toast.error("The quiz attempt is not active. Check the timer or try refreshing.");
      return;
    }
    if (!hasAnswers) {
      toast.error("Please answer at least one question before submitting.");
      return;
    }
    setSubmitting(true);
    const db = createClient();
    try {
      const { error } = await db.rpc("submit_quiz_attempt_v2", {
        _quiz_id: quizId,
        _answers: answers,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Quiz submitted successfully!");
        setSessionReady(false);
        setAnswers({});
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Assessment questions">
      {sessionError && <div role="alert" className="surface border-amber-500 p-4 text-xs">{sessionError}</div>}
      {saveError && <div role="alert" className="surface border-amber-500 p-4 text-xs">{saveError}</div>}
      {timed && secondsLeft !== null && <div className={"surface-flat flex items-center gap-3 p-4 text-xs " + (secondsLeft <= 60 ? "text-red-600" : "")}>
        <Clock3 size={18}/>Time remaining <strong className="ml-auto tabular-nums">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong>
      </div>}
      {timed && secondsLeft === 0 && <p role="alert" className="text-xs text-red-600">Time expired. Submission is locked by the server. Contact faculty if you need assistance.</p>}
      {!sessionReady && !sessionError && <p role="status" className="text-xs text-[var(--muted)]">Preparing your secure quiz attempt…</p>}
      <section className="surface-flat p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold">Your attempt</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{answeredCount} of {questions.length} questions answered</div>
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className="status-pill">{attemptsRemaining} {attemptsRemaining === 1 ? "attempt" : "attempts"} remaining</span>{savedAt && <span className="status-pill"><CloudCheck size={12}/>Saved {savedAt}</span>}</div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
          <div className="h-full rounded-full bg-[var(--green-strong)] transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      </section>
      {orderedQuestions.map((q, idx) => {
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const currentAnswer = answers[q.id];
        const selectedValues = Array.isArray(currentAnswer) ? currentAnswer : [];
        return (
          <article key={q.id} className="surface p-5 sm:p-6">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>Question {idx + 1}</span>
              <span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[10px]">{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>
            </div>
            <p className="mt-2 text-sm font-medium">{q.prompt}</p>

            {q.question_type === "short_answer" ? (
              <input
                type="text"
                className="input-base mt-3"
                maxLength={5000}
                aria-label={`Your answer to question ${idx + 1}`}
                placeholder="Write your answer…"
                value={typeof answers[q.id] === "string" ? answers[q.id] : ""}
                onChange={(e) => handleSelect(q.id, e.target.value)}
              />
            ) : q.question_type === "true_false" ? (
              <div className="mt-3 flex gap-3">
                {["True", "False"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--line)] p-3 text-xs font-medium transition-colors ${
                      answers[q.id] === opt ? "bg-[var(--green-soft)] border-[var(--green)] text-[var(--green-strong)]" : "hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => handleSelect(q.id, opt)}
                      className="hidden"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : q.question_type === "multiple_select" ? (
              <div className="mt-3 space-y-2">
                {rawOptions.map((opt, optIdx) => {
                  const label = typeof opt === "string" ? opt : opt.label ?? String(opt);
                  const val = typeof opt === "string" ? opt : opt.value ?? String(optIdx);
                  const checked = selectedValues.includes(val);
                  return (
                    <label
                      key={optIdx}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-xs transition-colors ${
                        checked ? "bg-[var(--green-soft)] border-[var(--green)] text-[var(--green-strong)] font-semibold" : "hover:bg-[var(--surface-2)] text-[var(--text)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMultipleSelect(q.id, val)}
                        className="h-3.5 w-3.5 accent-[var(--green)]"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {rawOptions.map((opt, optIdx) => {
                  const label = typeof opt === "string" ? opt : opt.label ?? String(opt);
                  const val = typeof opt === "string" ? opt : opt.value ?? String(optIdx);
                  const isChecked = answers[q.id] === val || answers[q.id] === label;
                  return (
                    <label
                      key={optIdx}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line)] p-3 text-xs transition-colors ${
                        isChecked ? "bg-[var(--green-soft)] border-[var(--green)] text-[var(--green-strong)] font-semibold" : "hover:bg-[var(--surface-2)] text-[var(--text)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={val}
                        checked={isChecked}
                        onChange={() => handleSelect(q.id, val)}
                        className="h-3.5 w-3.5 accent-[var(--green)]"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </article>
        );
      })}

      <div className="surface-flat flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span className="text-[11px] text-[var(--muted)]">Review your answers before submitting.</span>
        <button
          type="submit"
          disabled={submitting || !sessionReady || (timed && secondsLeft === 0)}
          className="btn-primary !px-6 !py-3 font-semibold"
        >
          <Send size={15} />
          {submitting ? "Submitting attempt…" : "Submit assessment"}
        </button>
      </div>
    </form>
  );
}
