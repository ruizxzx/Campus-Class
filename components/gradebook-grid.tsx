"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { validGradeWeights, weightedRecordedIndex, type GradeWeights } from "@/lib/gradebook-policy";
import { Download, GraduationCap, ShieldCheck, Printer, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useUiLanguage } from "@/lib/use-ui-language";
import { translateUi } from "@/lib/ui-language";

type Column = { key: string; title: string; type: string; maxMarks: number };
type Row = { id: string; name: string; scores: (number | null)[]; attendance: number | null };

export function GradebookGrid({ classes, classId, columns, rows, staff, weights, canEditPolicy, policyAvailable }: {
  classes: { id: string; name: string }[]; classId: string; columns: Column[]; rows: Row[]; staff: boolean;
  weights: GradeWeights | null; canEditPolicy:boolean; policyAvailable:boolean;
}) {
  const router = useRouter();
  const language=useUiLanguage();
  const t=(label:string)=>translateUi(label,language);
  const avg = rows.flatMap((row) => row.scores.map((score,index) => score === null ? null :
    columns[index]?.maxMarks > 0 ? Math.min(100,score / columns[index].maxMarks * 100) : null))
    .filter((item): item is number => item !== null);
  const overall = avg.length ? Math.round(avg.reduce((a,b)=>a+b,0) / avg.length) : null;
  const learnerAverage = (row: Row) => {
    const scores=row.scores.flatMap((score,index)=>{
      const max=columns[index]?.maxMarks;
      return score!==null && max>0 ? [Math.min(100,score/max*100)] : [];
    });
    return scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  };

  const weightedIndex=(row:Row)=>weights?weightedRecordedIndex(row,columns,weights):null;
  const weightedValues=rows.map(weightedIndex).filter((value):value is number=>value!==null);
  const weightedClassAverage=weightedValues.length
    ?Math.round(weightedValues.reduce((a,b)=>a+b,0)/weightedValues.length*100)/100:null;
  const reportedScores=rows.map((row)=>weights?weightedIndex(row):learnerAverage(row))
    .filter((value):value is number=>value!==null);
  const bands=[
    { label:"0–19%",low:0,high:20 },{label:"20–39%",low:20,high:40},
    {label:"40–59%",low:40,high:60},{label:"60–79%",low:60,high:80},
    {label:"80–100%",low:80,high:101},
  ];
  function exportCsv() {
    const clean = (cell: string | number) => {
      const value = String(cell);
      // Neutralize CSV formulas when opened in spreadsheet applications.
      const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
      return '"' + safe.replaceAll('"','""') + '"';
    };
    const lines = [
      ["Student","Attendance %","Released average %",...(weights?["Weighted index %"]:[]),...columns.map((item) => item.title + " (" + item.maxMarks + ")")],
      ...rows.map((row) => [row.name, row.attendance ?? "—",learnerAverage(row) ?? "—",...(weights?[weightedIndex(row) ?? "—"]:[]),...row.scores.map((item) => item ?? "—")]),
    ].map((items) => items.map((item) => clean(item)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([lines],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download="campusclass-gradebook.csv";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    toast.success("Gradebook exported.");
  }

  return <div className="space-y-5 gradebook-print">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">{t("Learners")}</p><p className="mt-3 text-3xl font-bold">{rows.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">{t("Published assessments")}</p><p className="mt-3 text-3xl font-bold">{columns.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">{t("Recorded-score average")}</p><p className="mt-3 text-3xl font-bold">{overall === null ? "—" : overall + "%"}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">{t("Class weighted index")}</p><p className="mt-3 text-3xl font-bold">{weightedClassAverage===null?"—":weightedClassAverage+"%"}</p>
        <p className="mt-1 text-[10px] text-[var(--muted)]">{weights?"Recorded released evidence only":t("Not configured")}</p></div>
    </div>
    <section className="surface min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><GraduationCap size={19}/>{t("Gradebook")}</h2><p className="mt-1 text-xs text-[var(--muted)]">{t("Blank scores are not counted as zeros.")}</p></div>
        <div className="flex flex-wrap gap-2"><select value={classId} className="input-base !w-auto max-w-full" aria-label={t("Choose class")} onChange={(event) => router.push("/gradebook?class_id=" + encodeURIComponent(event.target.value))}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {staff && <button type="button" className="btn-secondary" onClick={exportCsv}><Download size={15}/>CSV</button>}
          {staff && <button type="button" className="btn-secondary" onClick={()=>window.print()}><Printer size={15}/>{t("Print")}</button>}
        </div>
      </div>
      <div className="table-wrap"><table className="table-base min-w-[540px]">
        <thead><tr><th>{t("Student")}</th><th>{t("Attendance")}</th><th>{t("Released average")}</th>{weights&&<th>{t("Weighted index")}</th>}{columns.map((column) => <th key={column.key}><div className="max-w-44 whitespace-normal">{column.title}</div><span className="text-[10px] font-normal capitalize">{column.type} · /{column.maxMarks}</span></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td className="font-semibold">{row.name}</td><td>{row.attendance === null ? "—" : row.attendance + "%"}</td><td>{learnerAverage(row) === null ? "—" : learnerAverage(row) + "%"}</td>{weights&&<td>{weightedIndex(row)===null?"—":weightedIndex(row)+"%"}</td>}{columns.map((column,index) => <td key={column.key} className="tabular-nums">{row.scores[index] === null ? "—" : row.scores[index]}</td>)}</tr>)}</tbody>
      </table>{rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">{t("No students are enrolled in this class.")}</p>}</div>
    </section>
    {canEditPolicy && <PolicyEditor key={classId} classId={classId} initial={weights} available={policyAvailable}/>}
    <section className="surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold">{t("Recorded learner score distribution")}</h2>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{weights?t("Configured weighted index"):t("Arithmetic mean of released assessment scores")}. Missing and unreleased scores are excluded.</p>
      <div className="mt-4 grid gap-3">{bands.map((band)=>{
        const count=reportedScores.filter((value)=>value>=band.low&&value<band.high).length;
        const percent=reportedScores.length?Math.round(count/reportedScores.length*100):0;
        return <div key={band.label} className="grid grid-cols-[70px_1fr_64px] items-center gap-3 text-xs">
          <span>{band.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--line)]" aria-label={count+" learners in "+band.label}>
            <div className="h-full rounded-full bg-[var(--green)]" style={{width:percent+"%"}}/>
          </div>
          <span className="text-right tabular-nums">{count} · {percent}%</span>
        </div>;
      })}</div>
    </section>
    <p className="text-[11px] leading-5 text-[var(--muted)]">Methodology: each category uses the arithmetic mean of released percentages for valid assessments. With a configured policy, category weights are normalized over categories with observed evidence; missing grades are never zeros. This recorded-data index is indicative, not an official transcript grade.</p>
    <div className="flex items-start gap-2 text-xs leading-6 text-[var(--muted)]"><ShieldCheck size={17} className="shrink-0"/>Official marks are released by authorized faculty. Missing grades are displayed as unavailable, not as failures.</div>
  </div>;
}

const defaultWeights:GradeWeights={
  assignment_weight:30,project_weight:20,quiz_weight:40,attendance_weight:10,
};
function PolicyEditor({classId,initial,available}:{
  classId:string;initial:GradeWeights|null;available:boolean;
}){
  const [values,setValues]=useState<GradeWeights>(initial??defaultWeights);
  const language=useUiLanguage();
  const t=(label:string)=>translateUi(label,language);
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  const fields:{key:keyof GradeWeights;label:string}[]=[
    {key:"assignment_weight",label:t("Assignments")},
    {key:"project_weight",label:t("Projects")},
    {key:"quiz_weight",label:t("Quizzes/exams")},
    {key:"attendance_weight",label:t("Attendance")},
  ];
  const valid=validGradeWeights(values);
  async function save(reset=false){
    setBusy(true);
    try{
      const response=await fetch("/api/gradebook/policy",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(reset?{action:"reset",class_id:classId}:{
          action:"save",class_id:classId,weights:values,
        }),
      });
      const data=await response.json().catch(()=>({error:"Invalid response."}));
      if(!response.ok)throw new Error(data.error??"Policy update failed.");
      toast.success(reset?"Grading policy removed.":"Class grading weights saved.");
      if(reset)setValues(defaultWeights);
      router.refresh();
    }catch(error){toast.error(error instanceof Error?error.message:"Unable to save weights.");}
    finally{setBusy(false);}
  }
  return <section className="surface p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={16}/>{t("Class grading policy")}</h2>
    <p className="mt-1 text-xs leading-6 text-[var(--muted)]">Optional and staff-controlled. A weighted index appears only after you save a policy. Use 0% to exclude a category. Changes affect the indicative index, never official released marks.</p>
    {!available?<p role="alert" className="mt-3 text-xs text-amber-600">Apply SQL migration 034 in Supabase before configuring class grading weights.</p>:<>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">{fields.map(({key,label})=><label key={key} className="text-xs font-medium">
        {label}
        <div className="mt-1 flex items-center gap-2"><input type="number" min={0} max={100} step={0.01}
          className="input-base" value={values[key]}
          onChange={(event)=>setValues((old)=>({...old,[key]:Number(event.target.value)}))}/><span>%</span></div>
      </label>)}</div>
      <p className="mt-3 text-xs" aria-live="polite">Total: {fields.reduce((sum,{key})=>sum+values[key],0).toFixed(2)}% {valid?"":"· Must equal 100%"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy||!valid} onClick={()=>save(false)}>{t("Save weights")}</button>
        {initial&&<button type="button" className="btn-secondary" disabled={busy}
          onClick={()=>{if(window.confirm("Remove the class weighting policy? Scores remain unchanged."))void save(true);}}>{t("Remove policy")}</button>}
      </div>
    </>}
  </section>;
}
