"use client";

import { useState } from "react";
import { ArrowUp, BrainCircuit, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          question: text,
          history: messages.slice(-8),
        }),
      });
      const raw = await response.text();
      let result: { answer?: string; error?: string } = {};
      if (raw) result = JSON.parse(raw) as typeof result;
      if (!response.ok) throw new Error(result.error ?? "Could not get an AI answer.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer ?? "" }]);
    } catch (error) {
      setMessages((current) => current.slice(0, -1));
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
          {!compact ? <span className="mt-1 block text-[10px] text-[var(--muted)]">Questions are grounded in the text on this page.</span> : null}
        </span>
        {!compact ? (open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>) : null}
      </button>
      {open ? (
        <div className={compact ? "mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3" : "border-t border-[var(--line)] p-4"}>
          {messages.length ? <div className="mb-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${message.role === "user" ? "ml-8 bg-[var(--green-soft)]" : "mr-8 bg-[var(--surface-2)]"}`}>
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[.1em] text-[var(--muted)]">{message.role === "user" ? "You" : "CampusClass AI"}</div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div> : null}
          {loading ? <p className="mb-3 animate-pulse text-[10px] text-[var(--muted)]">Studying this resource…</p> : null}
          <form onSubmit={ask} className="flex items-end gap-2">
            <textarea
              className="input-base min-h-11 max-h-32 flex-1 resize-y !px-3 !py-2.5 text-xs"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={4000}
              placeholder="Ask a question about this chapter…"
              aria-label="Ask AI about this resource"
            />
            <button type="submit" className="btn-primary !h-10 !w-10 !shrink-0 !p-0" disabled={loading || !question.trim()} aria-label="Send question"><ArrowUp size={16}/></button>
          </form>
          <p className="mt-2 text-[9px] leading-4 text-[var(--muted)]">AI answers can make mistakes. The response is based only on this resource.</p>
        </div>
      ) : null}
    </div>
  );
}
