"use client";
import {AIMarkdown} from "@/components/ai-markdown";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function AISummarizeButton({ resourceType, resourceId }: {
  resourceType: "post" | "course" | "lesson" | "syllabus";
  resourceId: string;
}) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_type: resourceType, resource_id: resourceId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not summarize this material.");
      setSummary(result.summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not summarize this material.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="min-w-0 w-full max-w-full sm:w-[420px]">
    <button type="button" className="btn-secondary !px-3 !py-2 text-[10px]" disabled={loading} onClick={() => void summarize()}>
      <Sparkles size={13}/>{loading ? "Summarizing…" : summary ? "Refresh summary" : "Summarize with AI"}
    </button>
    {summary ? <div className="mt-3 w-full max-h-[min(45vh,280px)] max-w-full overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--green-strong)]"><Sparkles size={12}/>Study summary</div>
      <div className="text-xs leading-6"><AIMarkdown value={summary}/></div>
      <p className="mt-2 text-[9px] text-[var(--muted)]">AI-generated from the text available in this learning item.</p>
    </div> : null}
  </div>;
}
