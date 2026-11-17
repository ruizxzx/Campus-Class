"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Send } from "lucide-react";

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
};

export function QuizRunner({ quizId, questions, attemptsRemaining, isOpen }: Props) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

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
    if (!hasAnswers) {
      toast.error("Please answer at least one question before submitting.");
      return;
    }
    setSubmitting(true);
    const db = createClient();
    try {
      const { error } = await db.rpc("submit_quiz_attempt", {
        _quiz_id: quizId,
        _answers: answers,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Quiz submitted successfully!");
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {questions.map((q, idx) => {
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const currentAnswer = answers[q.id];
        const selectedValues = Array.isArray(currentAnswer) ? currentAnswer : [];
        return (
          <article key={q.id} className="surface p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>Question {idx + 1}</span>
              <span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[10px]">{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>
            </div>
            <p className="mt-2 text-sm font-medium">{q.prompt}</p>

            {q.question_type === "short_answer" ? (
              <input
                type="text"
                className="input mt-3"
                maxLength={5000}
                placeholder="Type your answer…"
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

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary !px-6 !py-3 font-semibold"
        >
          <Send size={15} />
          {submitting ? "Submitting attempt…" : "Submit assessment"}
        </button>
      </div>
    </form>
  );
}
