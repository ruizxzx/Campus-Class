import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { format } from "date-fns";
import { NoteComposer } from "@/components/note-composer";

export default async function NotesPage() {
 const profile=await requireProfile();const db=await createClient();
 const {data:notes,error}=await db.from("personal_notes").select("id,title,plain_text,is_pinned,updated_at").eq("user_id",profile.id).order("is_pinned",{ascending:false}).order("updated_at",{ascending:false});
 if(error) console.error("Unable to load notes", error);
 return <><PageHeader title="My notes" description="Private notes for your college work and study planning."/><NoteComposer/><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{notes?.length?notes.map(n=><article key={n.id} className="surface p-4"><div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{n.title}</h2>{n.is_pinned?<span className="text-[10px] text-[var(--green)]">Pinned</span>:null}</div><p className="mt-2 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{n.plain_text}</p><div className="mt-3 text-[10px] text-[var(--muted)]">Updated {format(new Date(n.updated_at),"dd MMM yyyy")}</div></article>):<EmptyState title="No notes yet" description="Create private study notes, meeting notes or reminders."/>}</div></>;
}
