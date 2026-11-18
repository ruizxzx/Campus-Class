"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Download, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AISummarizeButton } from "@/components/ai-summarize-button";
import { AIResourceAssistant } from "@/components/ai-resource-assistant";

type ClassOption = { id: string; display_name: string | null; section: string; subjects?: { name: string; code: string } | { name: string; code: string }[] | null };
type SyllabusRow = { id: string; title: string; file_name: string; file_size: number; outline_text: string; storage_path: string; class_id: string };
type ScheduleRow = { id: string; class_id: string; weekday: number; start_time: string; end_time: string; location: string | null; notes: string | null };

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SyllabusManager({ classes, syllabi, canManage }: { classes: ClassOption[]; syllabi: SyllabusRow[]; canManage: boolean }) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    const form = new FormData();
    form.set("class_id", classId);
    form.set("title", title);
    form.set("outline_text", outline);
    form.set("file", file);
    try {
      const response = await fetch("/api/syllabi", { method: "POST", body: form });
      const raw = await response.text();
      let result: { error?: string } = {};
      if (raw) {
        try {
          result = JSON.parse(raw) as typeof result;
        } catch {
          throw new Error("The server returned an unreadable upload response.");
        }
      }
      if (!response.ok) throw new Error(result.error ?? "Could not upload the syllabus.");
      toast.success("Syllabus uploaded.");
      setClassId("");
      setTitle("");
      setOutline("");
      setFile(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the syllabus.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch("/api/syllabi", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const result = await response.json();
    if (!response.ok) toast.error(result.error ?? "Could not delete the syllabus.");
    else {
      toast.success("Syllabus removed.");
      router.refresh();
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    {canManage ? <form onSubmit={upload} className="surface h-fit space-y-4 p-5">
      <div className="text-sm font-semibold">Upload class syllabus</div>
      <label className="block text-xs font-semibold">Class<select className="input-base mt-2" required value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Choose a class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name || "Class"} · Section {item.section}</option>)}</select></label>
      <label className="block text-xs font-semibold">Syllabus title<input className="input-base mt-2" required minLength={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Course syllabus"/></label>
      <label className="block text-xs font-semibold">Outline text<textarea className="input-base mt-2 min-h-28 resize-y" maxLength={50000} value={outline} onChange={(event) => setOutline(event.target.value)} placeholder="Paste a searchable outline for students and AI study help."/></label>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--line)] p-4 text-xs hover:border-[var(--green)]"><UploadCloud size={17} className="text-[var(--green)]"/><span className="min-w-0 break-all">{file?.name ?? "Choose PDF · up to 20 MB"}</span><input className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label>
      <button className="btn-primary w-full" disabled={saving || !classId || !title.trim() || !file}>{saving ? "Uploading…" : "Upload syllabus"}<UploadCloud size={14}/></button>
    </form> : null}
    <section className="surface min-w-0 p-4 sm:p-5">
      <div className="mb-4 text-sm font-semibold">Published syllabi</div>
      {syllabi.length ? <div className="space-y-3">{syllabi.map((syllabus) => {
        const classroom = classes.find((item) => item.id === syllabus.class_id);
        return <article key={syllabus.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Download size={15}/></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{syllabus.title}</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{classroom?.display_name ?? "Class"} · Section {classroom?.section ?? "—"} · {Math.max(1, Math.round(syllabus.file_size / 1024))} KB</div>
            {syllabus.outline_text ? <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{syllabus.outline_text}</p> : null}
            {syllabus.outline_text ? <div className="mt-3 flex flex-wrap gap-2"><AISummarizeButton resourceType="syllabus" resourceId={syllabus.id}/><AIResourceAssistant resourceType="syllabus" resourceId={syllabus.id} compact /></div> : null}
          </div>
          <button type="button" className="btn-secondary !px-3 !py-2 text-[10px]" onClick={async () => {
            const supabase = createClient();
            const { data, error } = await supabase.storage.from("class-syllabi").createSignedUrl(syllabus.storage_path, 300, { download: syllabus.file_name });
            if (error || !data?.signedUrl) toast.error("Could not open this syllabus.");
            else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
          }}><Download size={13}/>Open PDF</button>
          {canManage ? <button type="button" className="btn-secondary !px-3 !py-2 text-[10px] text-[var(--danger)]" onClick={() => void remove(syllabus.id)}><Trash2 size={13}/>Delete</button> : null}
        </article>;
      })}</div> : <p className="text-xs text-[var(--muted)]">No syllabi have been published.</p>}
    </section>
  </div>;
}

export function ScheduleManager({ classes, entries, canManage }: { classes: ClassOption[]; entries: ScheduleRow[]; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ classId: "", weekday: "1", startTime: "09:00", endTime: "10:00", location: "", notes: "" });
  const [saving, setSaving] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: form.classId,
          weekday: Number(form.weekday),
          start_time: form.startTime,
          end_time: form.endTime,
          location: form.location,
          notes: form.notes,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? `Timetable could not be saved (HTTP ${response.status}).`);
      toast.success("Timetable entry added.");
      setForm({ classId: "", weekday: "1", startTime: "09:00", endTime: "10:00", location: "", notes: "" });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the timetable entry.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch("/api/schedules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) toast.error(result?.error ?? "Could not delete the timetable entry.");
    else {
      toast.success("Timetable entry removed.");
      router.refresh();
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    {canManage ? <form onSubmit={add} className="surface h-fit space-y-4 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold"><CalendarPlus size={16}/>Add class time</div>
      <label className="block text-xs font-semibold">Class<select className="input-base mt-2" required value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value })}><option value="">Choose a class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name || "Class"} · Section {item.section}</option>)}</select></label>
      <label className="block text-xs font-semibold">Day<select className="input-base mt-2" value={form.weekday} onChange={(event) => setForm({ ...form, weekday: event.target.value })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">Starts<input className="input-base mt-2" type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></label>
        <label className="block text-xs font-semibold">Ends<input className="input-base mt-2" type="time" required value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })}/></label>
      </div>
      <label className="block text-xs font-semibold">Location<input className="input-base mt-2" maxLength={180} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Room or online link"/></label>
      <label className="block text-xs font-semibold">Notes<textarea className="input-base mt-2 min-h-20 resize-y" maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
      <button className="btn-primary w-full" disabled={saving || !form.classId}>{saving ? "Saving…" : "Add to timetable"}<CalendarPlus size={14}/></button>
    </form> : null}
    <section className="surface min-w-0 p-4 sm:p-5">
      <div className="mb-4 text-sm font-semibold">Weekly timetable</div>
      {entries.length ? <div className="space-y-2">{[...entries].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((entry) => {
        const classroom = classes.find((item) => item.id === entry.class_id);
        return <article key={entry.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4">
          <div className="w-20 text-xs font-semibold">{weekdays[entry.weekday]}</div>
          <div className="w-28 text-xs">{entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}</div>
          <div className="min-w-0 flex-[1_1_160px]"><div className="text-xs font-semibold">{classroom?.display_name ?? "Class"} · Section {classroom?.section ?? "—"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{entry.location || "Location not set"}{entry.notes ? ` · ${entry.notes}` : ""}</div></div>
          {canManage ? <button type="button" className="btn-secondary !px-3 !py-2 text-[10px]" onClick={() => void remove(entry.id)}><Trash2 size={13}/>Delete</button> : null}
        </article>;
      })}</div> : <p className="text-xs text-[var(--muted)]">No timetable entries yet.</p>}
    </section>
  </div>;
}
