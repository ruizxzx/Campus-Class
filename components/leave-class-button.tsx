"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function LeaveClassButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function leaveClass() {
    if (!window.confirm("Leave this class? You will no longer see its assignments or announcements.")) return;
    setBusy(true);
    const { error } = await createClient().from("class_enrollments").delete().eq("id", enrollmentId);
    if (error) {
      toast.error("Could not leave this class. Contact your college administrator if enrollment is locked.");
      setBusy(false);
      return;
    }
    toast.success("You left the class.");
    router.replace("/classes");
    router.refresh();
  }

  return <button type="button" className="btn-secondary" onClick={() => void leaveClass()} disabled={busy}>
    <LogOut size={14} />{busy ? "Leaving…" : "Leave class"}
  </button>;
}
