"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function StreamCommentForm({ postId }: { postId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 10000) return;
    setBusy(true);
    const db = createClient();
    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError || !user) {
      toast.error("Please sign in again to comment.");
      setBusy(false);
      return;
    }

    const { error } = await db.from("stream_comments").insert({
      post_id: postId,
      author_id: user.id,
      body: trimmed,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not add your comment. You may not have access to this discussion.");
      return;
    }
    setBody("");
    toast.success("Comment added.");
    router.refresh();
  }

  return (
    <form onSubmit={send} className="flex gap-2">
      <label className="sr-only" htmlFor="stream-comment">Add a comment</label>
      <input
        id="stream-comment"
        className="input flex-1"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={10000}
        placeholder="Add to the discussion…"
      />
      <button type="submit" className="btn-primary" aria-label="Send comment" disabled={busy || !body.trim()}>
        <Send size={14} />
      </button>
    </form>
  );
}
