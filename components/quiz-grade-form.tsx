"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type ManualQuestion = {
  id: string;
  prompt: string;
  marks: number;
};

type Props = {
  attemptId: string;
  questions: ManualQuestion[];
  answers: Record<string, string | string[]>;
  initialScores: Record<string, number>;
  feedback: string | null;
};

export function QuizGradeForm({ attemptId, questions, answers, initialScores, feedback }: Props) {
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialScores).map(([id, score]) => [id, String(score)])),
  );
  const [comment, setComment] = useState(feedback ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save(release: boolean) {
    if (questions.some((question) => {
      const score = scores[question.id];
      return score === undefined || score === "" || !Number.isFinite(Number(score))
        || Number(score) < 0 || Number(score) > question.marks;
    })) {
      toast.error("Enter a valid score for every short-answer question.");
      return;
    }

    setBusy(true);
    const { error } = await createClient().rpc("grade_quiz_attempt", {
      _attempt_id: attemptId,
      _question_scores: Object.fromEntries(
        questions.map((question) => [question.id, Number(scores[question.id])]),
      ),
      _feedback: comment,
      _release: release,
    });
    setBusy(false);

    if (error) {
      toast.error("Could not save this evaluation. Check the attempt and try again.");
      return;
    }

    toast.success(release ? "Evaluation released to the student." : "Evaluation saved as a draft.");
    router.refresh();
  }

  return (
    <details className="mt-3 rounded-xl border border-[var(--line)] p-3">
      <summary className="cursor-pointer text-xs font-semibold">Evaluate written answers</summary>
      <div className="mt-3 space-y-3">
        {questions.map((question) => {
          const answer = answers[question.id];
          return (
            <label key={question.id} className="block text-xs">
              <span className="font-medium">{question.prompt} · {question.marks} marks</span>
              <span className="mt-1 block whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-3">
                {Array.isArray(answer) ? answer.join(", ") : answer || "No answer"}
              </span>
              <input
                className="input mt-2"
                type="number"
                min="0"
                max={question.marks}
                step="0.01"
                required
                value={scores[question.id] ?? ""}
                onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))}
                aria-label={`Score for ${question.prompt}`}
              />
            </label>
          );
        })}
        <label className="block text-xs font-medium">
          Feedback
          <textarea
            className="input mt-1 min-h-20 w-full"
            maxLength={10000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save(false)}>
            {busy ? "Saving…" : "Save evaluation"}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(true)}>
            {busy ? "Saving…" : "Grade and release"}
          </button>
        </div>
      </div>
    </details>
  );
}
