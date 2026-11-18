"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type QuestionType = "multiple_choice" | "multiple_select" | "true_false" | "short_answer";
type QuestionDraft = {
  type: QuestionType;
  prompt: string;
  options: string;
  answer: string;
  marks: string;
};
type ClassItem = { id: string; display_name: string; section: string };

function createQuestion(): QuestionDraft {
  return { type: "multiple_choice", prompt: "", options: "", answer: "", marks: "1" };
}

export function QuizAuthoringForm({ classes }: { classes: ClassItem[] }) {
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [duration, setDuration] = useState("");
  const [attempts, setAttempts] = useState("1");
  const [showScore, setShowScore] = useState(false);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question, itemIndex) => (
      itemIndex === index ? { ...question, ...patch } : question
    )));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const preparedQuestions: { question_type: QuestionType; prompt: string; options: string[]; answer_key: string | string[] | null; marks: number; position: number }[] = [];
    for (const [index, question] of questions.entries()) {
      const prompt = question.prompt.trim();
      const marks = Number(question.marks);
      if (!prompt || !Number.isFinite(marks) || marks <= 0 || marks > 10000) {
        toast.error(`Review question ${index + 1} and its marks.`);
        return;
      }

      const options = question.type === "true_false"
        ? ["True", "False"]
        : question.type === "short_answer"
          ? []
          : question.options.split("\n").map((option) => option.trim()).filter(Boolean);
      if (question.type !== "short_answer" && (options.length < 2 || new Set(options).size !== options.length)) {
        toast.error(`Question ${index + 1} needs at least two unique options.`);
        return;
      }
      if (question.type === "multiple_select") {
        const answer = question.answer.split("\n").map((value) => value.trim()).filter(Boolean);
        if (!answer.length || answer.some((value) => !options.includes(value)) || new Set(answer).size !== answer.length) {
          toast.error(`Set one or more valid answers for question ${index + 1}.`);
          return;
        }
        preparedQuestions.push({ question_type: question.type, prompt, options, answer_key: answer, marks, position: index });
      } else if (question.type === "short_answer") {
        preparedQuestions.push({ question_type: question.type, prompt, options, answer_key: null, marks, position: index });
      } else if (!options.includes(question.answer)) {
        toast.error(`Choose a correct option for question ${index + 1}.`);
        return;
      } else {
        preparedQuestions.push({ question_type: question.type, prompt, options, answer_key: question.answer, marks, position: index });
      }
    }

    const openDate = opensAt ? new Date(opensAt) : null;
    const closeDate = closesAt ? new Date(closesAt) : null;
    if ((opensAt && Number.isNaN(openDate?.getTime())) || (closesAt && Number.isNaN(closeDate?.getTime()))
      || (openDate && closeDate && closeDate <= openDate)) {
      toast.error("Choose a valid assessment window.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          title: title.trim(),
          description: description.trim(),
          opens_at: openDate?.toISOString() ?? null,
          closes_at: closeDate?.toISOString() ?? null,
          duration_minutes: duration ? Number(duration) : null,
          attempts_allowed: Number(attempts),
          show_score_after_submit: showScore,
          publish,
          questions: preparedQuestions,
        }),
      });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok) {
        toast.error(result.error ?? "Could not save the assessment.");
        return;
      }
    } catch (error) {
      console.error("Unable to submit quiz assessment", error);
      toast.error("The assessment could not be saved. Check your connection and try again.");
      return;
    } finally {
      setBusy(false);
    }
    toast.success(publish ? "Assessment published." : "Assessment saved as a draft.");
    setTitle("");
    setDescription("");
    setQuestions([createQuestion()]);
    setOpensAt("");
    setClosesAt("");
    setDuration("");
    setAttempts("1");
    setShowScore(false);
    router.refresh();
  }

  const input = "input-base";
  const totalMarks = questions.reduce((total, question) => total + (Number(question.marks) || 0), 0);
  return (
    <form onSubmit={save} className="surface min-w-0 space-y-5 p-5 sm:p-6">
      <div className="flex items-start gap-3 border-b border-[var(--line)] pb-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><ClipboardCheck size={18} /></span>
        <div>
          <h2 className="text-base font-semibold tracking-[-.025em]">Create a quiz or exam</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Choose the class, add questions, and set a clear assessment window.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Classroom
          <select className={`${input} mt-2`} required value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Choose a classroom</option>
            {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.display_name} · {classroom.section}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold">Assessment title
          <input className={`${input} mt-2`} required minLength={2} maxLength={180} placeholder="e.g. Chapter 4 knowledge check" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <label className="block text-xs font-semibold">Instructions <span className="font-normal text-[var(--muted)]">· optional</span>
        <textarea className={`${input} mt-2 min-h-20 resize-y`} maxLength={10000} placeholder="Add context or instructions for students" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <div className="mb-3 text-xs font-semibold">Schedule and attempts</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-[var(--muted)]">Opens at
            <input className={`${input} mt-1.5 bg-[var(--surface)]`} type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} />
          </label>
          <label className="block text-[11px] font-medium text-[var(--muted)]">Closes at
            <input className={`${input} mt-1.5 bg-[var(--surface)]`} type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} />
          </label>
          <label className="block text-[11px] font-medium text-[var(--muted)]">Time limit · minutes
            <input className={`${input} mt-1.5 bg-[var(--surface)]`} type="number" min="1" max="600" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
          <label className="block text-[11px] font-medium text-[var(--muted)]">Attempts allowed
            <input className={`${input} mt-1.5 bg-[var(--surface)]`} type="number" min="1" max="20" required value={attempts} onChange={(event) => setAttempts(event.target.value)} />
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Questions</h3>
          <p className="mt-1 text-[10px] text-[var(--muted)]">{questions.length} questions · {totalMarks.toLocaleString()} total marks</p>
        </div>
        <button type="button" className="btn-secondary !px-3 !py-2 text-xs" disabled={questions.length >= 100} onClick={() => setQuestions((current) => [...current, createQuestion()])}>
          <Plus size={14} />Add question
        </button>
      </div>

      <div className="space-y-3">
        {questions.map((question, index) => {
          const options = question.type === "true_false"
            ? ["True", "False"]
            : question.options.split("\n").map((option) => option.trim()).filter(Boolean);
          return (
            <section key={index} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold">Question {String(index + 1).padStart(2, "0")}</h3>
                {questions.length > 1 ? (
                  <button type="button" aria-label={`Remove question ${index + 1}`} className="btn-secondary !px-2.5 !py-2 text-[10px]" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 size={13} />Remove
                  </button>
                ) : null}
              </div>
              <label className="block text-[11px] font-semibold">Question type
                <select className={`${input} mt-1.5`} value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value as QuestionType, answer: "" })}>
                  <option value="multiple_choice">Multiple choice · one answer</option>
                  <option value="multiple_select">Multiple select · several answers</option>
                  <option value="true_false">True or false</option>
                  <option value="short_answer">Short answer · instructor graded</option>
                </select>
              </label>
              <label className="mt-3 block text-[11px] font-semibold">Prompt
                <textarea className={`${input} mt-1.5 min-h-20 resize-y`} required maxLength={5000} placeholder="Write the question" value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} />
              </label>
              {question.type !== "true_false" && question.type !== "short_answer" ? (
                <label className="mt-3 block text-[11px] font-semibold">Answer choices
                  <textarea className={`${input} mt-1.5 min-h-20 resize-y`} required placeholder="One option per line" value={question.options} onChange={(event) => updateQuestion(index, { options: event.target.value })} />
                  <span className="mt-1 block font-normal text-[var(--muted)]">Add one choice per line.</span>
                </label>
              ) : null}
              {question.type === "multiple_choice" || question.type === "true_false" ? (
                <label className="mt-3 block text-[11px] font-semibold">Correct answer
                  <select className={`${input} mt-1.5`} required value={question.answer} onChange={(event) => updateQuestion(index, { answer: event.target.value })}>
                    <option value="">Choose the correct answer</option>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ) : null}
              {question.type === "multiple_select" ? (
                <label className="mt-3 block text-[11px] font-semibold">Correct answers
                  <textarea className={`${input} mt-1.5 min-h-16 resize-y`} required placeholder="One correct answer per line" value={question.answer} onChange={(event) => updateQuestion(index, { answer: event.target.value })} />
                </label>
              ) : null}
              {question.type === "short_answer" ? <p className="mt-2 text-xs text-[var(--muted)]">Written responses are scored by faculty before results are released.</p> : null}
              <label className="mt-3 block max-w-48 text-[11px] font-semibold">Marks
                <input className={`${input} mt-1.5`} type="number" min="0.01" max="10000" step="0.01" required value={question.marks} onChange={(event) => updateQuestion(index, { marks: event.target.value })} />
              </label>
            </section>
          );
        })}
      </div>
      <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <label className="flex items-start gap-2.5 text-xs">
          <input className="mt-0.5 h-4 w-4 accent-[var(--green-strong)]" type="checkbox" checked={showScore} onChange={(event) => setShowScore(event.target.checked)} />
          <span><span className="block font-semibold">Release objective scores after submission</span><span className="mt-1 block text-[10px] text-[var(--muted)]">Manual-answer assessments still require instructor grading and result release.</span></span>
        </label>
        <label className="flex items-center gap-2.5 text-xs">
          <input className="h-4 w-4 accent-[var(--green-strong)]" type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
          <span className="font-semibold">Publish when saved</span>
        </label>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[10px] text-[var(--muted)]">Students will only see published assessments for their classes.</span>
        <button className="btn-primary" disabled={busy || !classes.length}>
          <ClipboardCheck size={15} />{busy ? "Saving…" : publish ? "Publish assessment" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
