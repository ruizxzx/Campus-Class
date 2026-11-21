"use client";
import { istDate } from "@/lib/display";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUiLanguage } from "@/lib/use-ui-language";
import { translateUi } from "@/lib/ui-language";
import { Activity, AlertTriangle, BookOpenCheck, CheckCircle2, Search, ShieldCheck, Download } from "lucide-react";
import Link from "next/link";
import { validSupportRules, type StudentSignal, type SupportRules } from "@/lib/student-success";

type Student = StudentSignal & { id: string; name: string; email: string };
type Intervention = { id: string; student_id: string; reason: string; note: string; status: string; created_at: string;
  action_plan: string | null; follow_up_at: string | null; outcome_note: string | null; resolved_at: string | null };
export function StudentSuccessDashboard({ classId, classes, students, interventions, nowMs, rules, canEditRules, rulesAvailable }: {
  classId: string; classes: { id: string; name: string }[]; students: Student[]; interventions: Intervention[]; nowMs: number;
  rules:SupportRules;canEditRules:boolean;rulesAvailable:boolean;
}) {
  const router = useRouter();
  const language=useUiLanguage();
  const t=(label:string)=>translateUi(label,language);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("support");
  const [note, setNote] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const displayed = useMemo(() => students.filter((person) => (filter === "all" || person.level === filter)
    && (person.name + " " + person.email).toLowerCase().includes(search.toLowerCase())), [students,filter,search]);
  const counts = {
    needs_support: students.filter((person) => person.level === "needs_support").length,
    watch: students.filter((person) => person.level === "watch").length,
    on_track: students.filter((person) => person.level === "on_track").length,
  };
  async function saveIntervention() {
    if (!selectedId || note.trim().length < 3) return;
    setSaving(true);
    try {
      const response = await fetch("/api/success/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", class_id: classId, student_id: selectedId, reason, note,
          action_plan: actionPlan, follow_up_at: followUpDate || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save intervention.");
      setSelectedId(""); setNote(""); setActionPlan(""); setFollowUpDate("");
      toast.success("Faculty follow-up recorded.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save follow-up.");
    } finally { setSaving(false); }
  }
  async function updateStatus(id: string, status: "open" | "in_progress" | "resolved") {
    const outcome = (outcomeDrafts[id] ?? "").trim();
    if (status === "resolved" && outcome.length < 3) {
      toast.error("Add an outcome note before resolving this follow-up.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/success/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, status,
          ...(outcome.length ? { outcome_note: outcome } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not update the follow-up.");
      setOutcomeDrafts((current) => ({ ...current, [id]: "" }));
      toast.success(status === "resolved" ? "Follow-up resolved with an outcome." : "Follow-up moved to in progress.");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed."); }
    finally { setSaving(false); }
  }
  function exportSignals() {
    // Only authorized staff receive this private roster from the server.
    const escapeCell=(value:string|number)=>{
      const raw=String(value);
      const safe=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
      return '"' + safe.replaceAll('"','""') + '"';
    };
    const csv=[["Student","Attendance %","Submission %","Released quiz %","Support signal","Reasons"],
      ...displayed.map((person)=>[person.name,person.attendancePercent??"—",person.submissionPercent??"—",
        person.quizPercent??"—",person.level,person.reasons.join("; ")])].map((cells)=>cells.map(escapeCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="campusclass-student-success.csv";
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const percent = (number: number | null) => number === null ? "—" : number + "%";
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: t("Learners"), value: students.length, icon: BookOpenCheck },
        { label: t("Need support"), value: counts.needs_support, icon: AlertTriangle },
        { label: t("Watchlist"), value: counts.watch, icon: Activity },
        { label: t("On track"), value: counts.on_track, icon: CheckCircle2 }].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} className="surface p-5"><div className="flex items-center justify-between text-xs text-[var(--muted)]">{item.label}<Icon size={18}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{item.value}</p></div>;
        })}
    </div>
    {canEditRules&&<SupportRuleEditor initial={rules} available={rulesAvailable}/>}
    <section className="surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">{t("Academic support signals")}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Transparent rules: attendance below {rules.attendance_min_percent}% ({rules.min_attendance_sessions}+ sessions), {rules.overdue_assignment_count}+ overdue items, released quiz average below {rules.quiz_min_percent}% ({rules.min_released_quizzes}+ results).</p></div>
        <select className="input-base !w-auto max-w-full" value={classId} onChange={(event) => router.push("/success?class_id=" + encodeURIComponent(event.target.value))}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <label className="relative min-w-[180px] flex-1"><Search size={15} className="absolute top-3.5 left-3 text-[var(--muted)]"/><input className="input-base !pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search students…")} aria-label={t("Search students…")}/></label>
        <select className="input-base !w-auto" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("Filter by signal")}>{[["all","All signals"],["needs_support","Needs support"],["watch","Watch"],["on_track","On track"],["insufficient_data","Collecting data"]].map(([value,label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
        <Link href="/attendance" className="btn-secondary">{t("Attendance")}</Link>
        <button type="button" className="btn-secondary" onClick={exportSignals}><Download size={15}/>{t("Export filtered CSV")}</button>
      </div>
      <div className="mt-5 table-wrap"><table className="table-base min-w-[720px]">
        <thead><tr><th>{t("Student")}</th><th>{t("Attendance")}</th><th>{t("Submissions")}</th><th>{t("Released quiz avg.")}</th><th>{t("Support signal")}</th><th>{t("Action")}</th></tr></thead>
        <tbody>{displayed.map((person) => <tr key={person.id}>
          <td><div className="font-semibold">{person.name}</div><div className="text-xs text-[var(--muted)]">{person.email}</div></td>
          <td>{percent(person.attendancePercent)}</td><td>{percent(person.submissionPercent)}</td><td>{percent(person.quizPercent)}</td>
          <td><span className={"status-pill " + (person.level === "on_track" ? "green" : person.level === "watch" || person.level === "needs_support" ? "orange" : "")}>{person.level.replaceAll("_"," ")}</span>{person.reasons.length > 0 && <div className="mt-2 max-w-56 text-xs text-[var(--muted)]">{person.reasons.join(" · ")}</div>}</td>
          <td><button type="button" className="btn-secondary !px-3 !py-2" onClick={() => setSelectedId(person.id)}>Plan follow-up</button></td>
        </tr>)}</tbody>
      </table>{!displayed.length && <div className="py-8 text-center text-sm text-[var(--muted)]">No learners match your filters.</div>}</div>
    </section>
    {selectedId && <section className="surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold">Record a faculty intervention</h2><p className="mt-1 text-xs text-[var(--muted)]">Private to authorized staff. Do not include sensitive diagnoses.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
        <input disabled className="input-base" value={students.find((person) => person.id === selectedId)?.name ?? "Student"} aria-label="Selected student"/>
        <select className="input-base" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Reason">{["support","attendance","missing_work","low_scores","other"].map((item) => <option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}</select>
      </div>
      <label className="mt-3 block text-xs font-semibold">Observation
        <textarea className="input-base mt-2 min-h-24" maxLength={3000} placeholder="Academic evidence and reason for support…" value={note} onChange={(event) => setNote(event.target.value)}/>
      </label>
      <label className="mt-3 block text-xs font-semibold">Action plan
        <textarea className="input-base mt-2 min-h-20" maxLength={3000} placeholder="Agreed support steps…" value={actionPlan} onChange={(event) => setActionPlan(event.target.value)}/>
      </label>
      <label className="mt-3 block text-xs font-semibold">Follow-up date
        <input type="date" className="input-base mt-2" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)}/>
      </label>
      <div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" disabled={saving || note.trim().length < 3} onClick={saveIntervention}>Save follow-up</button><button className="btn-secondary" onClick={() => setSelectedId("")}>Cancel</button></div>
    </section>}
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("Faculty follow-ups")}</h2>
        <p className="text-xs text-[var(--muted)]">{interventions.filter((item)=>item.status!=="resolved").length} active · {interventions.filter((item)=>item.status!=="resolved"&&item.follow_up_at&&Date.parse(item.follow_up_at)<nowMs).length} overdue</p>
      </div>
      <div className="mt-4 space-y-3">{interventions.length === 0 && <p className="text-xs text-[var(--muted)]">No support plans have been recorded yet.</p>}
      {interventions.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{students.find((person) => person.id === item.student_id)?.name ?? "Student"} · {item.reason.replaceAll("_"," ")}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6">{item.note}</p>
          {item.action_plan && <p className="mt-2 whitespace-pre-wrap text-xs"><strong>Action plan:</strong> {item.action_plan}</p>}
          {item.follow_up_at && <p className="mt-2 text-xs text-[var(--muted)]">Follow up by {item.follow_up_at}</p>}
          {item.outcome_note && <p className="mt-2 whitespace-pre-wrap text-xs"><strong>Outcome:</strong> {item.outcome_note}</p>}
          <p className="mt-1 text-[10px] text-[var(--muted)]">{istDate(item.created_at)}</p>
          {item.status !== "resolved" && <div className="mt-3 space-y-2">
            <label className="block text-xs font-semibold">Outcome note
              <textarea className="input-base mt-2 min-h-16" maxLength={3000}
                value={outcomeDrafts[item.id] ?? ""}
                onChange={(event) => setOutcomeDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Record the follow-up outcome before resolving"/>
            </label>
            <div className="flex flex-wrap gap-2">
              {item.status === "open" && <button type="button" disabled={saving} className="btn-secondary !px-3 !py-2" onClick={() => updateStatus(item.id,"in_progress")}>Start follow-up</button>}
              <button type="button" disabled={saving || (outcomeDrafts[item.id] ?? "").trim().length < 3}
                className="btn-secondary !px-3 !py-2" onClick={() => updateStatus(item.id,"resolved")}>Resolve with outcome</button>
            </div>
          </div>}
        </div>
        <span className="status-pill">{item.status}</span>
      </div>)}</div>
    </section>
    <p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><ShieldCheck size={17} className="shrink-0"/>Signals are descriptive and depend on available records. They must never be used as an automated decision about student eligibility, discipline, or grading.</p>
  </div>;
}

function SupportRuleEditor({initial,available}:{initial:SupportRules;available:boolean}){
  const [values,setValues]=useState<SupportRules>(initial);
  const language=useUiLanguage();
  const t=(label:string)=>translateUi(label,language);
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  const fields:{key:keyof SupportRules;label:string;max:number}[]=[
    {key:"attendance_min_percent",label:"Attendance alert below (%)",max:100},
    {key:"overdue_assignment_count",label:"Alert after overdue assignments",max:100},
    {key:"quiz_min_percent",label:"Quiz average alert below (%)",max:100},
    {key:"min_attendance_sessions",label:"Min attendance sessions",max:100},
    {key:"min_assigned_work",label:"Min assignments for evidence",max:100},
    {key:"min_released_quizzes",label:"Min released quizzes",max:100},
  ];
  const valid=validSupportRules(values);
  async function save(){
    setBusy(true);
    try{
      const response=await fetch("/api/success/rules",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values),
      });
      const data=await response.json().catch(()=>({error:"Unreadable server response."}));
      if(!response.ok)throw new Error(data.error??"Cannot save thresholds.");
      toast.success("College support thresholds updated.");
      router.refresh();
    }catch(error){
      toast.error(error instanceof Error?error.message:"Could not save support thresholds.");
    }finally{setBusy(false);}
  }
  return <details className="surface p-4 sm:p-6">
    <summary className="cursor-pointer text-sm font-semibold">{t("Configure explainable support signals (college administrators)")}</summary>
    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">These rules identify students for faculty support only. They never alter official grades or make automated high-stakes decisions.</p>
    {!available?<p className="mt-3 text-xs text-amber-600" role="alert">Apply SQL migration 035 before saving college-wide rules.</p>:<>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(({key,label,max})=>
        <label key={key} className="text-xs font-medium">{label}
          <input className="input-base mt-1" type="number"
            step={key==="attendance_min_percent"||key==="quiz_min_percent"?0.01:1}
            min={key==="attendance_min_percent"||key==="quiz_min_percent"?0:1} max={max}
            value={values[key]}
            onChange={(event)=>setValues((current)=>({...current,[key]:Number(event.target.value)}))}/>
        </label>)}</div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy||!valid} onClick={save}>
          {busy?"Saving…":"Save support thresholds"}
        </button>
        {!valid&&<p className="text-xs text-rose-600">Enter valid thresholds.</p>}
      </div>
    </>}
  </details>;
}
