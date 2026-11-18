"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CloudOff, FileText, Plus, ShieldCheck, Trash2 } from "lucide-react";

/** Opt-in local draft: never placed into service worker cache or uploaded until saved. */
export function NoteComposer({ userId }: { userId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowLocalDraft, setAllowLocalDraft] = useState(false);
  const [offline, setOffline] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const draftKey = "campusclass:note-draft:" + userId;
  const consentKey = "campusclass:note-draft-enabled:" + userId;

  useEffect(() => {
    const updateConnectivity = () => setOffline(!navigator.onLine);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    try {
      if (window.localStorage.getItem(consentKey) === "yes") {
        setAllowLocalDraft(true);
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const recovered = JSON.parse(raw) as { title?: string; body?: string };
          if (typeof recovered.title === "string" && typeof recovered.body === "string") {
            setTitle(recovered.title); setBody(recovered.body);
            setDraftMessage("A draft was restored from this browser.");
          }
        }
      }
    } catch {
      // Private browsing or storage policies may disable access.
    }
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [draftKey, consentKey]);

  useEffect(() => {
    if (!allowLocalDraft) return;
    const handle = window.setTimeout(() => {
      try {
        if (title.trim() || body.trim()) {
          window.localStorage.setItem(draftKey, JSON.stringify({ title, body, savedAt: Date.now() }));
          setDraftMessage("Draft saved on this device.");
        } else {
          window.localStorage.removeItem(draftKey);
          setDraftMessage("");
        }
      } catch {
        setDraftMessage("Local draft could not be saved on this device.");
      }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [title, body, draftKey, allowLocalDraft]);

  function chooseDraftPreference(checked: boolean) {
    if (checked) {
      try {
        window.localStorage.setItem(consentKey, "yes");
        setAllowLocalDraft(true);
      } catch { toast.error("This browser does not allow offline drafts."); }
    } else {
      setAllowLocalDraft(false);
      try {
        window.localStorage.removeItem(consentKey);
        window.localStorage.removeItem(draftKey);
      } catch { /* No access to storage */ }
      setDraftMessage("");
    }
  }

  function deleteDraft() {
    setTitle(""); setBody(""); setDraftMessage("");
    try { window.localStorage.removeItem(draftKey); } catch { /* Storage unavailable */ }
    toast.message("Draft cleared from this editor.");
  }

  async function save() {
    if (!title.trim()) return toast.error("Add a note title.");
    setBusy(true);
    try {
      const db = createClient();
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError || user?.id !== userId) throw new Error("Your session has expired. Sign in to save this note.");
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("college_id").eq("id", userId).single();
      if (profileError || !profile) throw new Error("Could not load your college profile.");
      const { error } = await db.from("personal_notes").insert({
        college_id: profile.college_id, user_id: userId,
        title: title.trim(), plain_text: body, content: { type: "plain", text: body },
      });
      if (error) throw new Error(error.message);
      try { window.localStorage.removeItem(draftKey); } catch { /* Storage unavailable */ }
      setTitle(""); setBody(""); setDraftMessage("");
      toast.success("Note saved securely to CampusClass.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save note.");
      if (allowLocalDraft) setDraftMessage("Save failed. Your opt-in device draft remains available.");
    } finally { setBusy(false); }
  }

  return <section className="surface min-w-0 p-4 sm:p-5" aria-label="Personal note editor">
    <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><FileText size={17} className="text-[var(--green)]"/>New study note</div>
    {offline && <p role="status" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-5"><CloudOff size={16} className="shrink-0"/>You are offline. Keep writing if you have enabled a device draft; reconnect to save to CampusClass.</p>}
    <label className="block text-xs font-semibold">Title<input className="input-base mt-2" required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Lecture summary"/></label>
    <label className="mt-3 block text-xs font-semibold">Notes<textarea className="input-base mt-2 min-h-28 resize-y" maxLength={30000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the ideas you want to remember…"/></label>
    <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-[var(--muted)]"><input className="mt-1 h-4 w-4 accent-[var(--green)]" type="checkbox" checked={allowLocalDraft} onChange={(event) => chooseDraftPreference(event.target.checked)}/>
      <span>Keep a draft on this device for interrupted connections. <strong>Opt-in only:</strong> not recommended on shared or public computers, since others with access to this browser may see it.</span>
    </label>
    {allowLocalDraft && draftMessage && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={14}/>{draftMessage}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="btn-primary" disabled={!title.trim() || busy || offline} onClick={() => void save()}><Plus size={15}/>{busy ? "Saving…" : "Save to CampusClass"}</button>
      <button type="button" className="btn-secondary" disabled={busy || (!title && !body)} onClick={deleteDraft}><Trash2 size={15}/>Clear editor</button>
    </div>
  </section>;
}
