"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function LessonCompleteButton({ lessonId, completed, onComplete }: {
  lessonId: string; completed: boolean; onComplete?: () => void;
}) {
  const [done, setDone] = useState(completed);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function markComplete() {
    if (done || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/lessons/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save your lesson progress.");
      setDone(true);
      onComplete?.();
      if (data.certificate) {
        toast.success("Course completed! Your college certificate is ready in Certificates.");
      } else {
        toast.success("Lecture marked complete.");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your lesson progress.");
    } finally { setBusy(false); }
  }
  return <button type="button" disabled={busy || done} onClick={() => void markComplete()} className="btn-secondary">
    {done ? <><CheckCircle2 size={14} />Completed</> : busy ? "Saving progress…" : "Mark lecture complete"}
  </button>;
}
