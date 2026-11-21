"use client";
import { classLabel } from "@/lib/display";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Download, Trash2, UploadCloud, Sparkles } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]);
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<{files:File[];items:{id:string;path:string;token:string;name:string;size:number;title:string;outline:string}[];done:Set<number>}|null>(null);
  const [saving, setSaving] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [useOcr, setUseOcr] = useState(false);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length) return;
    if(files.length>10||files.some(file=>!file.name.toLowerCase().endsWith(".pdf")||file.size<=0||file.size>20*1024*1024)){
      toast.error("Choose up to 10 valid PDF files of 20 MB each.");return;
    }
    setSaving(true);
    try{
      let current=pending.current;
      if(!current){
        const response=await fetch("/api/syllabi/batch",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"prepare",class_id:classId,title,outline,
            files:files.map(f=>({name:f.name,size:f.size}))}),
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error??"Could not prepare syllabus uploads.");
        if(data.items?.length!==files.length)throw new Error("Syllabus upload preparation failed.");
        current={files:[...files],items:data.items,done:new Set<number>()};
        pending.current=current;
        setHasPending(true);
      }
      const db=createClient();
      for(let i=0;i<current.files.length;i++){
        if(current.done.has(i))continue;
        const entry=current.items[i];
        const {error}=await db.storage.from("class-syllabi")
          .uploadToSignedUrl(entry.path,entry.token,current.files[i],{
            contentType:"application/pdf",upsert:false});
        if(error)throw new Error("Could not upload "+entry.name+": "+error.message);
        current.done.add(i);
      }
      const finish=await fetch("/api/syllabi/batch",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"publish",class_id:classId,
          items:current.items.map(({id,path,name,size,title,outline})=>({id,path,name,size,title,outline}))}),
      });
      const data=await finish.json().catch(()=>({}));
      if(!finish.ok)throw new Error(data.error??"Could not publish the uploaded PDFs. Retry finalization.");
      pending.current=null;setHasPending(false);setFiles([]);setClassId("");setTitle("");setOutline("");
      toast.success(data.count+" syllabus PDF(s) published.");
      router.refresh();
    }catch(error){toast.error(error instanceof Error?error.message:"Syllabus upload failed; retry.");}
    finally{setSaving(false);}
  }

  async function indexPdf(id:string){
    setIndexingId(id);
    try{
      const response=await fetch("/api/ai/index-syllabus",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({syllabus_id:id,use_ocr:useOcr}),
      });
      const data=await response.json() as {
        error?:string;indexed_chunks?:number;page_numbers_verified?:boolean;
      };
      if(!response.ok)throw new Error(data.error??"Unable to index this PDF.");
      toast.success("PDF text indexed into "+data.indexed_chunks+" searchable passages."
        +(data.page_numbers_verified?" Page citations are available.":" Page numbers were not present in the parsed content."));
    }catch(error){
      toast.error(error instanceof Error?error.message:"Could not index this syllabus.");
    }finally{setIndexingId(null);}
  }

  async function remove(id: string) {
    const response = await fetch("/api/syllabi", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const result = await response.json();
    if (!response.ok) toast.error(result.error ?? "Could not delete the syllabus.");
    else {
      if (result.storageCleanupPending) toast.warning("Syllabus removed from the class. Storage cleanup requires administrator attention.");
      else toast.success("Syllabus removed.");
      router.refresh();
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    {canManage ? <form onSubmit={upload} className="surface h-fit space-y-4 p-5">
      <div className="text-sm font-semibold">Upload class syllabus</div>
      <label className="block text-xs font-semibold">Class<select className="input-base mt-2" required value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Choose a class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name || "Class"} · Section {item.section}</option>)}</select></label>
      <label className="block text-xs font-semibold">Syllabus title<input className="input-base mt-2" required minLength={2} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Course syllabus"/></label>
      <label className="block text-xs font-semibold">Outline text<textarea className="input-base mt-2 min-h-28 resize-y" maxLength={50000} value={outline} onChange={(event) => setOutline(event.target.value)} placeholder="Paste a searchable outline for students and AI study help."/></label>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--line)] p-4 text-xs hover:border-[var(--green)]"><UploadCloud size={17} className="text-[var(--green)]"/><span className="min-w-0 break-all">{files.length?files.length+" PDFs selected":"Choose up to 10 PDFs · 20 MB each"}</span><input className="hidden" type="file" multiple disabled={saving||hasPending} accept="application/pdf,.pdf" onChange={(event) => setFiles(Array.from(event.target.files??[]))}/></label>
      <button className="btn-primary w-full" disabled={saving || !classId || !title.trim() || !files.length}>{saving ? "Uploading…" : hasPending ? "Retry / finish uploads" : "Upload syllabus PDFs"}<UploadCloud size={14}/></button>
    </form> : null}
    <section className="surface min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Published syllabi</h2>
          {canManage&&<p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Index a syllabus PDF to enable grounded Copilot text search. The college OpenRouter provider processes the document, and extracted text is held privately in Supabase.</p>}
        </div>
        {canManage&&<label className="flex items-start gap-2 text-[11px] text-[var(--muted)]">
          <input type="checkbox" checked={useOcr} onChange={(event)=>setUseOcr(event.target.checked)} className="mt-1"/>
          <span>Use paid OCR for scanned PDFs</span>
        </label>}
      </div>
      {syllabi.length ? <div className="space-y-3">{syllabi.map((syllabus) => {
        const classroom = classes.find((item) => item.id === syllabus.class_id);
        return <article key={syllabus.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Download size={15}/></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{syllabus.title}</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{classLabel(classroom??{})} · {Math.max(1, Math.round(syllabus.file_size / 1024))} KB</div>
            {syllabus.outline_text ? <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{syllabus.outline_text}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {syllabus.outline_text&&<AISummarizeButton resourceType="syllabus" resourceId={syllabus.id}/>}
              <AIResourceAssistant resourceType="syllabus" resourceId={syllabus.id} compact />
            </div>
          </div>
          <button type="button" className="btn-secondary !px-3 !py-2 text-[10px]" onClick={async () => {
            const supabase = createClient();
            const { data, error } = await supabase.storage.from("class-syllabi").createSignedUrl(syllabus.storage_path, 300, { download: syllabus.file_name });
            if (error || !data?.signedUrl) toast.error("Could not open this syllabus.");
            else window.location.assign(data.signedUrl);
          }}><Download size={13}/>Open PDF</button>
          {canManage&&<button type="button" className="btn-secondary !px-3 !py-2 text-[10px]"
            disabled={indexingId!==null} onClick={()=>void indexPdf(syllabus.id)}>
              <Sparkles size={13}/>{indexingId===syllabus.id?"Indexing PDF…":"Index / re-index PDF"}
            </button>}
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
  const [suggestions, setSuggestions] = useState<{ start_time: string; end_time: string }[]>([]);
  const [finding, setFinding] = useState(false);

  async function suggestTimes() {
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    if (!form.classId || duration < 15 || duration > 240) {
      toast.error("Choose a class and a duration between 15 minutes and 4 hours.");
      return;
    }
    setFinding(true);
    try {
      const response = await fetch("/api/schedules/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: form.classId, weekday: Number(form.weekday),
          duration_minutes: duration, location: form.location }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not find free slots.");
      setSuggestions(result.suggestions ?? []);
      if (!result.suggestions?.length) toast.message("No free slots in the 8 AM–6 PM search window.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load suggestions.");
    } finally { setFinding(false); }
  }

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
      <button type="button" className="btn-secondary w-full" disabled={finding || saving || !form.classId} onClick={suggestTimes}>{finding ? "Checking availability…" : "Suggest free time slots"}</button>
      {!!suggestions.length && <div className="flex flex-wrap gap-2" aria-label="Suggested timetable slots">{suggestions.map((slot) =>
        <button key={slot.start_time} type="button" className="rounded-lg border border-[var(--line)] bg-[var(--green-soft)] px-3 py-2 text-xs font-semibold" onClick={() => { setForm({ ...form, startTime: slot.start_time, endTime: slot.end_time }); setSuggestions([]); }}>{slot.start_time}–{slot.end_time}</button>)}</div>}
      <button className="btn-primary w-full" disabled={saving || !form.classId}>{saving ? "Saving…" : "Add to timetable"}<CalendarPlus size={14}/></button>
    </form> : null}
    <section className="surface min-w-0 p-4 sm:p-5">
      <div className="mb-4 text-sm font-semibold">Weekly timetable</div>
      {entries.length ? <div className="space-y-2">{[...entries].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((entry) => {
        const classroom = classes.find((item) => item.id === entry.class_id);
        return <article key={entry.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4">
          <div className="w-20 text-xs font-semibold">{weekdays[entry.weekday]}</div>
          <div className="w-28 text-xs">{entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}</div>
          <div className="min-w-0 flex-[1_1_160px]"><div className="text-xs font-semibold">{classLabel(classroom??{})}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{entry.location || "Location not set"}{entry.notes ? ` · ${entry.notes}` : ""}</div></div>
          {canManage ? <button type="button" className="btn-secondary !px-3 !py-2 text-[10px]" onClick={() => void remove(entry.id)}><Trash2 size={13}/>Delete</button> : null}
        </article>;
      })}</div> : <p className="text-xs text-[var(--muted)]">No timetable entries yet.</p>}
    </section>
  </div>;
}
