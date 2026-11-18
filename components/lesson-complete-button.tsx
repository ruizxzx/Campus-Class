"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function LessonCompleteButton({
  lessonId,
  completed,
  onComplete,
}: {
  lessonId: string;
  completed: boolean;
  onComplete?: () => void;
}) {
  const [done, setDone] = useState(completed);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function markComplete() {
    if (done || busy) return;
    setBusy(true);
    try {
      const db = createClient();
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError || !user) {
        toast.error("Your session has expired. Sign in again to save progress.");
        return;
      }

      const { data: profile, error: profileError } = await db.from("profiles")
        .select("college_id")
        .eq("id", user.id)
        .single();
      if (profileError || !profile) {
        toast.error("Your college profile could not be verified.");
        return;
      }

      const { error } = await db.from("lesson_progress").upsert(
        { college_id: profile.college_id, lesson_id: lessonId, student_id: user.id },
        { onConflict: "lesson_id,student_id" },
      );
      if (error) {
        toast.error("Could not save your lesson progress.");
        return;
      }

      setDone(true);
      onComplete?.();
      toast.success("Lecture marked complete.");
      router.refresh();
    } catch (error: unknown) {
      console.error("Unable to save lesson progress", error);
      toast.error("Could not save your lesson progress.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={busy || done} onClick={() => void markComplete()} className="btn-secondary">
      {done ? <><CheckCircle2 size={14} />Completed</> : busy ? "Saving progress…" : "Mark lecture complete"}
    </button>
  );
}
