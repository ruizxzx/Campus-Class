"use client";
import {AIMarkdown} from "@/components/ai-markdown";

import { useEffect, useState } from "react";
import { ArrowUp, BrainCircuit, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

type ResourceType = "post" | "course" | "lesson" | "syllabus";
type Message = { role: "user" | "assistant"; content: string };

export function AIResourceAssistant({
  resourceType,
  resourceId,
  compact = false,
}: {
  resourceType: ResourceType;
  resourceId: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !compact) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, compact]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setQuestion("");
    try {
      const response = await fetch("/api/ai/resource-assistant", {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          question: text,
          history: messages.slice(-8).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2500) })),
        }),
      });
      const result: { answer?: unknown; error?: unknown } | null = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : `Could not get an AI answer (HTTP ${response.status}).`);
      }
      const answer = result?.answer;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("The AI returned no answer. Please retry.");
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (error) {
      setMessages((current) => current.slice(0, -1));
      setQuestion(text);
      toast.error(error instanceof Error ? error.message : "Could not get an AI answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "surface overflow-hidden"}>
      <button
        type="button"
        className={compact ? "btn-secondary !px-3 !py-2 text-[10px]" : "flex w-full items-center gap-3 p-4 text-left"}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {compact ? <Sparkles size={13}/> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={16}/></span>}
        <span className={compact ? "" : "min-w-0 flex-1"}>
          {!compact ? <span className="block text-xs font-semibold">Ask AI about this resource</span> : "Ask AI"}
          {!compact ? <span className="mt-1 block text-[10px] text-[var(--muted)]">Answers use resource text; syllabus questions can also read the private PDF.</span> : null}
        </span>
        {!compact ? (open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>) : null}
      </button>
      {open ? (
        compact ? (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Ask AI about this resource" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
            <div className="flex max-h-[min(72vh,620px)] w-full max-w-lg flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
              <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={16}/></span>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">Ask AI about this resource</div><div className="mt-0.5 text-[9px] text-[var(--muted)]">Grounded in accessible course material</div></div>
                <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={() => setOpen(false)} aria-label="Close Ask AI"><X size={16}/></button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {messages.length ? <div className="space-y-2" aria-live="polite">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-5 ${message.role === "user" ? "ml-auto bg-[var(--green-soft)]" : "mr-auto bg-[var(--surface-2)]"}`}>
                      <div className="mb-1 text-[9px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">{message.role === "user" ? "You" : "CampusClass AI"}</div>
                      {message.role==="assistant"?<AIMarkdown value={message.content}/>:<p className="whitespace-pre-wrap break-words">{message.content}</p>}
                    </div>
                  ))}
                </div> : <div className="rounded-xl bg-[var(--surface-2)] px-4 py-5 text-center"><Sparkles size={18} className="mx-auto text-[var(--green-strong)]"/><p className="mt-2 text-xs font-semibold">What would you like to understand?</p><p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Ask for a summary, explanation, key ideas or a study question.</p></div>}
                {loading ? <p className="mt-3 animate-pulse text-[10px] text-[var(--muted)]">Studying this resource…</p> : null}
              </div>
              <form onSubmit={ask} className="border-t border-[var(--line)] p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    className="input-base min-h-11 max-h-24 min-w-0 flex-1 resize-y !px-3 !py-2.5 text-xs"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={4000}
                    placeholder="Ask a question about this chapter…"
                    aria-label="Ask AI about this resource"
                  />
                  <button type="submit" className="btn-primary !h-10 !w-10 !shrink-0 !p-0" disabled={loading || !question.trim()} aria-label="Send question"><ArrowUp size={16}/></button>
                </div>
                <p className="mt-2 text-[9px] leading-4 text-[var(--muted)]">AI answers can make mistakes. For syllabi, the attached PDF is also sent to the configured provider.</p>
              </form>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--line)] p-4">
            {messages.length ? <div className="mb-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-5 ${message.role === "user" ? "ml-auto bg-[var(--green-soft)]" : "mr-auto bg-[var(--surface-2)]"}`}>
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">{message.role === "user" ? "You" : "CampusClass AI"}</div>
                  {message.role==="assistant"?<AIMarkdown value={message.content}/>:<p className="whitespace-pre-wrap break-words">{message.content}</p>}
                </div>
              ))}
            </div> : null}
            {loading ? <p className="mb-3 animate-pulse text-[10px] text-[var(--muted)]">Studying this resource…</p> : null}
            <form onSubmit={ask} className="flex items-end gap-2">
              <textarea className="input-base min-h-11 max-h-32 min-w-0 flex-1 resize-y !px-3 !py-2.5 text-xs" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} placeholder="Ask a question about this chapter…" aria-label="Ask AI about this resource"/>
              <button type="submit" className="btn-primary !h-10 !w-10 !shrink-0 !p-0" disabled={loading || !question.trim()} aria-label="Send question"><ArrowUp size={16}/></button>
            </form>
            <p className="mt-2 text-[9px] leading-4 text-[var(--muted)]">AI answers can make mistakes. The response is based only on this resource.</p>
          </div>
        )
      ) : null}
    </div>
  );
}
