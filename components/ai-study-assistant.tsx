"use client";
import {AIMarkdown} from "@/components/ai-markdown";
import type { CopilotPracticeQuestion } from "@/lib/copilot-practice";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useUiLanguage } from "@/lib/use-ui-language";
import { translateUi } from "@/lib/ui-language";
import { ArrowUp, BrainCircuit, Sparkles } from "lucide-react";

type Reference = { id: string; type: string; title: string; href: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Reference[]; practiceQuestions?: CopilotPracticeQuestion[] };

const suggestedQuestions = [
  "What should I work on next?",
  "Summarize my upcoming deadlines.",
  "Help me understand my class syllabus.",
];

export function AIStudyAssistant({ syllabi, notes }: {
  syllabi: { id:string; title:string; class_id:string }[];
  notes: { id:string; title:string }[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number,Record<number,number>>>({});
  const [submittedQuiz, setSubmittedQuiz] = useState<Record<number,boolean>>({});
  const language=useUiLanguage();
  const t=(label:string)=>translateUi(label,language);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [mode, setMode] = useState<"chat" | "practice" | "revision">("chat");
  const [syllabusId, setSyllabusId] = useState("");
  const [noteId, setNoteId] = useState("");

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2500) }));
    setMessages((current) => [...current, { role: "user", content: text }]);
    setQuestion("");
    setSending(true);
    setRequestError("");
    try {
      const response = await fetch("/api/ai/study-assistant", {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, mode, syllabus_id: syllabusId || null, note_id: noteId || null }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? `The study assistant could not answer (HTTP ${response.status}).`);
      if (typeof result?.answer !== "string" || !result.answer.trim()) throw new Error("The AI returned no answer. Please retry.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer, sources: result.sources ?? [], practiceQuestions: Array.isArray(result.practiceQuestions) ? result.practiceQuestions : undefined }]);
    } catch (error) {
      setMessages((current) => current.filter((message, index) => !(index === current.length - 1 && message.role === "user" && message.content === text)));
      setQuestion(text);
      const message = error instanceof Error && error.name === "TimeoutError"
        ? "The study assistant timed out. Your question was restored; please retry."
        : error instanceof Error ? error.message : "The study assistant could not answer.";
      setRequestError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return <section className="surface mx-auto flex min-h-[min(70vh,760px)] max-w-4xl flex-col overflow-hidden">
    <header className="flex items-center gap-3 border-b border-[var(--line)] p-5 sm:p-6">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={18}/></div>
      <div><h2 className="text-sm font-semibold">{t("Campus AI Study Copilot")}</h2><p className="mt-1 text-[10px] text-[var(--muted)]">Grounded in accessible lessons, course notes, syllabus outlines and assignments.</p></div>
      <span className="status-pill ml-auto hidden sm:inline-flex"><Sparkles size={11}/>{t("College AI")}</span>
    </header>

    <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
      {!messages.length ? <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--green-strong)]"><Sparkles size={20}/></div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">{t("What are you working on?")}</h3>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Ask about what is due, upcoming quizzes, your class syllabus, or a concept from published course material.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{suggestedQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(t(item))} className="btn-secondary !rounded-full !px-3 !py-2 text-[10px]">{t(item)}</button>)}</div>
      </div> : messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-[var(--green-soft)]" : "bg-[var(--surface-2)]"}`}>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{message.role === "user" ? t("You") : "CampusClass AI"}</div>
        {message.role==="assistant"&&message.practiceQuestions?.length ? <section className="space-y-4" aria-label="Interactive practice quiz">
          <p className="text-xs text-[var(--muted)]">Practice only — this score will not appear in your gradebook. Correct answers stay hidden until you submit.</p>
          {message.practiceQuestions.map((item,i)=><fieldset key={i} className="rounded-xl border border-[var(--line)] p-3">
            <legend className="px-1 text-xs font-semibold">Question {i+1} of {message.practiceQuestions?.length}</legend>
            <p className="mb-3 text-sm">{item.question}</p>
            <div className="space-y-2">{item.choices.map((choice,j)=><label key={j}
              className={"flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs "+
                (submittedQuiz[index]&&j===item.answer?"border-green-600 bg-[var(--green-soft)]":
                  submittedQuiz[index]&&quizAnswers[index]?.[i]===j&&j!==item.answer?"border-red-500":"border-[var(--line)]")}>
              <input type="radio" className="mt-0.5" name={"practice-"+index+"-"+i}
                checked={quizAnswers[index]?.[i]===j} disabled={Boolean(submittedQuiz[index])}
                onChange={()=>setQuizAnswers(current=>({...current,[index]:{...current[index],[i]:j}}))}/>
              <span>{String.fromCharCode(65+j)}. {choice}</span>
            </label>)}</div>
            {submittedQuiz[index]?<p className="mt-2 text-xs">
              {quizAnswers[index]?.[i]===item.answer?"Correct.":"Incorrect. Correct answer: "+String.fromCharCode(65+item.answer)+"."}
              {item.explanation?" "+item.explanation:""}
              {item.sourceIds.length?" Sources: "+item.sourceIds.map(id=>"["+id+"]").join(" "):""}
            </p>:null}
          </fieldset>)}
          {submittedQuiz[index]?<p role="status" className="font-semibold">Practice score: {message.practiceQuestions.filter((q,i)=>quizAnswers[index]?.[i]===q.answer).length}/{message.practiceQuestions.length}</p>:
            <button type="button" className="btn-primary" disabled={Object.keys(quizAnswers[index]??{}).length!==message.practiceQuestions.length}
              onClick={()=>setSubmittedQuiz(current=>({...current,[index]:true}))}>Check answers</button>}
        </section> : message.role==="assistant"?<AIMarkdown value={message.content}/>:<p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.sources?.length ? <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3" aria-label="Referenced course sources">
          {message.sources.map((source) => <Link key={source.id} href={source.href} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold hover:text-[var(--green)]" title={source.type + ": " + source.title}>[{source.id}] {source.title}</Link>)}
        </div> : null}
      </div>)}
      {sending ? <div className="max-w-[88%] animate-pulse rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--muted)]">{t("Checking your workspace…")}</div> : null}
    </div>

    <form onSubmit={ask} className="border-t border-[var(--line)] p-4 sm:p-5">
      {requestError && <p role="alert" className="mb-3 rounded-lg border border-amber-500 p-3 text-xs">{requestError}</p>}
      <div role="group" aria-label="Study copilot mode" className="mb-3 flex flex-wrap gap-2">
        {([{ value:"chat", label:"Ask and explain" },{ value:"practice", label:"Practice quiz" },{ value:"revision", label:"7-day revision plan" }] as const).map((item) =>
          <button key={item.value} type="button" aria-pressed={mode===item.value} onClick={() => { setMode(item.value); setQuestion(item.value==="practice" ? "Create practice questions from my published course material." : item.value==="revision" ? "Plan my revision for the coming week." : ""); }} className={"rounded-full border px-3 py-2 text-xs font-semibold transition-colors " + (mode===item.value ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-strong)]" : "border-[var(--line)]")}>{t(item.label)}</button>)}
      </div>
      {syllabi.length>0&&<label className="mb-3 block text-[11px] font-medium">
        Study a full syllabus PDF (optional)
        <select className="input-base mt-1" value={syllabusId} onChange={(event)=>setSyllabusId(event.target.value)}>
          <option value="">{t("Use published lessons and outlines")}</option>
          {syllabi.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="mt-1 block text-[10px] text-[var(--muted)]">When selected, the private PDF is sent to the configured AI provider for this question.</span>
      </label>}
      {notes.length>0&&<label className="mb-3 block text-[11px] font-medium">
        Include one of my private notes (optional)
        <select className="input-base mt-1" value={noteId} onChange={(event)=>setNoteId(event.target.value)}>
          <option value="">{t("Do not share my personal notes with AI")}</option>
          {notes.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="mt-1 block text-[10px] text-[var(--muted)]">Only the note you explicitly select is included in this AI request. It is sent to your college&apos;s configured AI provider.</span>
      </label>}
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2 focus-within:border-[var(--green)]">
        <textarea className="max-h-32 min-h-11 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--muted)]" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} placeholder={t("Ask about your classes or pending work…")} aria-label={t("Ask the study assistant")}/>
        <button className="btn-primary !h-10 !w-10 !shrink-0 !justify-center !p-0" disabled={sending || !question.trim()} aria-label={t("Send question")}><ArrowUp size={17}/></button>
      </div>
      <p className="mt-2 px-1 text-[9px] leading-4 text-[var(--muted)]">AI can make mistakes. Citations refer to published lesson text, syllabus outlines, and any personal note you explicitly selected. When selected above, the full PDF is provided to the model for that request. Relevant content is processed by your college’s configured AI provider.</p>
    </form>
  </section>;
}
