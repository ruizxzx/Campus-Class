"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowUp, BrainCircuit, Sparkles } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const suggestedQuestions = [
  "What should I work on next?",
  "Summarize my upcoming deadlines.",
  "Help me understand my class syllabus.",
];

export function AIStudyAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setQuestion("");
    setSending(true);
    try {
      const response = await fetch("/api/ai/study-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The study assistant could not answer.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (error) {
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === "user" && message.content === text)));
      setQuestion(text);
      toast.error(error instanceof Error ? error.message : "The study assistant could not answer.");
    } finally {
      setSending(false);
    }
  }

  return <section className="surface mx-auto flex min-h-[min(70vh,760px)] max-w-4xl flex-col overflow-hidden">
    <header className="flex items-center gap-3 border-b border-[var(--line)] p-5 sm:p-6">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={18}/></div>
      <div><h2 className="text-sm font-semibold">Your study assistant</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Grounded in your classes, published assessments, to-do items and syllabus outlines.</p></div>
      <span className="status-pill ml-auto"><Sparkles size={11}/>AI enabled by your college</span>
    </header>

    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
      {!messages.length ? <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--green-strong)]"><Sparkles size={20}/></div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">What are you working on?</h3>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Ask about what is due, upcoming quizzes, your class syllabus, or a concept from published course material.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{suggestedQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="btn-secondary !rounded-full !px-3 !py-2 text-[10px]">{item}</button>)}</div>
      </div> : messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-[var(--green-soft)]" : "bg-[var(--surface-2)]"}`}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{message.role === "user" ? "You" : "CampusClass AI"}</div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>)}
      {sending ? <div className="max-w-[88%] animate-pulse rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--muted)]">Checking your workspace…</div> : null}
    </div>

    <form onSubmit={ask} className="border-t border-[var(--line)] p-4 sm:p-5">
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2 focus-within:border-[var(--green)]">
        <textarea className="max-h-32 min-h-11 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--muted)]" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} placeholder="Ask about your classes or pending work…" aria-label="Ask the study assistant"/>
        <button className="btn-primary !h-10 !w-10 !shrink-0 !justify-center !p-0" disabled={sending || !question.trim()} aria-label="Send question"><ArrowUp size={17}/></button>
      </div>
      <p className="mt-2 px-1 text-[9px] leading-4 text-[var(--muted)]">AI can make mistakes. Don’t include sensitive personal information. Your question and relevant workspace text are processed by OpenRouter.</p>
    </form>
  </section>;
}
