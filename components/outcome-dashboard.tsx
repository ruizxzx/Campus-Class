"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target, Plus, Link2, ShieldCheck, Download, Printer } from "lucide-react";

type Outcome = { id:string; code:string; title:string; target_percent:number; attainment:number|null; mappings:{id:string;key:string;weight:number;observed:number|null}[] };
type Assessment = { id:string; title:string; type:string };
export function OutcomeDashboard({classes,classId,subjectId,outcomes,assessments}:{
  classes:{id:string;subjectId:string;name:string}[];classId:string;subjectId:string;outcomes:Outcome[];assessments:Assessment[];
}) {
  const router=useRouter();
  const [code,setCode]=useState("");
  const [title,setTitle]=useState("");
  const [target,setTarget]=useState(60);
  const [mappingOutcome,setMappingOutcome]=useState("");
  const [assessmentKey,setAssessmentKey]=useState("");
  const [weight,setWeight]=useState(1);
  const [saving,setSaving]=useState(false);
  const [editingOutcome,setEditingOutcome]=useState("");
  const [editTitle,setEditTitle]=useState("");
  const [editTarget,setEditTarget]=useState(60);
  async function save(body:object, message:string){
    setSaving(true);
    try{
      const res=await fetch("/api/outcomes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await res.json().catch(()=>null);
      if(!res.ok)throw Error(data?.error??"Unable to save outcomes.");
      toast.success(message);router.refresh();
    }catch(err){toast.error(err instanceof Error?err.message:"Unable to save.");}
    finally{setSaving(false);}
  }
  const met=outcomes.filter((item)=>item.attainment!==null&&item.attainment>=item.target_percent).length;
  const below=outcomes.filter((item)=>item.attainment!==null&&item.attainment<item.target_percent).length;
  function exportOutcomes(){
    const escaped=(value:string|number)=>{
      const raw=String(value);
      const safe=/^[=+@\\-\\t\\r]/.test(raw)?"'"+raw:raw;
      return '"'+safe.replaceAll('"','""')+'"';
    };
    const cells=[
      ["Course outcome","Description","Target %","Observed attainment %","Gap (percentage points)","Mapped assessments"],
      ...outcomes.map((item)=>[
        item.code,item.title,item.target_percent,item.attainment??"Not available",
        item.attainment===null?"Not available":Math.round((item.attainment-item.target_percent)*100)/100,
        item.mappings.map((mapping)=>mapping.key+" weight="+mapping.weight+
          " observed="+(mapping.observed===null?"NA":mapping.observed)).join("; "),
      ]),
    ];
    const csv=cells.map((row)=>row.map(escaped).join(",")).join("\r\n");
    const href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=href;link.download="campusclass-course-outcomes.csv";
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);
    toast.success("Outcome report exported.");
  }
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Defined outcomes</p><p className="mt-3 text-3xl font-bold">{outcomes.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">With graded evidence</p><p className="mt-3 text-3xl font-bold">{outcomes.filter((item)=>item.attainment!==null).length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Available assessments</p><p className="mt-3 text-3xl font-bold">{assessments.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Below target (observed)</p>
        <p className="mt-3 text-3xl font-bold">{below}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{met} outcomes meeting targets</p></div>
    </div>
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold"><Target size={19}/>Outcome attainment</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2 text-xs" onClick={exportOutcomes}><Download size={14}/>Export CSV</button>
          <button type="button" className="btn-secondary !px-3 !py-2 text-xs" onClick={()=>window.print()}><Printer size={14}/>Print</button>
          <select className="input-base !w-auto max-w-full" value={classId} onChange={(event)=>router.push("/outcomes?class_id="+encodeURIComponent(event.target.value))} aria-label="Choose class">{classes.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{outcomes.map((item)=><article key={item.id} className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[var(--green-strong)]">{item.code}</p><h3 className="mt-1 text-sm font-semibold">{item.title}</h3></div><span className="status-pill">{item.attainment===null?"No data":item.attainment+"%"}</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--line)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.attainment??0} aria-label={"Observed attainment of "+item.code}><div className="h-full rounded-full bg-[var(--green)]" style={{width:(item.attainment??0)+"%"}}/></div>
        <p className="mt-2 text-xs text-[var(--muted)]">Target {item.target_percent}% · Gap {item.attainment===null?"—":(item.attainment-item.target_percent)+" pp"} · {item.mappings.length} linked assessments · {item.attainment===null?"Awaiting released marks":item.attainment>=item.target_percent?"Target met in observed results":"Below target in observed results"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2" onClick={()=>setMappingOutcome(item.id)}><Link2 size={14}/>Map an assessment</button>
          <button type="button" className="btn-secondary !px-3 !py-2" onClick={()=>{setEditingOutcome(item.id);setEditTitle(item.title);setEditTarget(item.target_percent);}}>Edit target</button>
        </div>
        {item.mappings.length>0&&<div className="mt-3 border-t border-[var(--line)] pt-3">
          <p className="mb-2 text-[11px] font-semibold">Assessment evidence</p>
          {item.mappings.map((mapping)=><div key={mapping.id} className="flex items-center justify-between gap-2 py-1 text-[11px]">
            <span className="min-w-0 truncate">{assessments.find((a)=>a.type+":"+a.id===mapping.key)?.title??"Other class assessment"} · weight {mapping.weight} · {mapping.observed===null?"No released grade":mapping.observed.toFixed(1)+"%"}</span>
            <button type="button" className="shrink-0 text-rose-600 underline disabled:opacity-50"
              disabled={saving} onClick={()=>{if(window.confirm("Unlink this assessment from this outcome? Existing grades will remain unchanged."))void save({action:"unlink",mapping_id:mapping.id},"Assessment unlinked.");}}>Unlink</button>
          </div>)}
        </div>}
      </article>)}</div>
      {!outcomes.length&&<p className="mt-5 text-xs text-[var(--muted)]">Define your first course outcome below.</p>}
    </section>
    {editingOutcome&&<section className="surface p-5 sm:p-6">
      <h2 className="text-sm font-semibold">Edit {outcomes.find((item)=>item.id===editingOutcome)?.code} target</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="text-xs">Outcome title<input className="input-base mt-1" minLength={3} maxLength={180} value={editTitle} onChange={(event)=>setEditTitle(event.target.value)} /></label>
        <label className="text-xs">Target %<input className="input-base mt-1" type="number" min={0} max={100} value={editTarget} onChange={(event)=>setEditTarget(Number(event.target.value))}/></label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary" disabled={saving||editTitle.trim().length<3||editTarget<0||editTarget>100}
          onClick={()=>save({action:"update",outcome_id:editingOutcome,title:editTitle,target_percent:editTarget},"Outcome updated.")}>Save changes</button>
        <button type="button" className="btn-secondary" onClick={()=>setEditingOutcome("")}>Cancel</button>
      </div>
    </section>}
    <section className="surface p-5 sm:p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Plus size={16}/>Create course outcome</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[120px_1fr_160px]"><input className="input-base" placeholder="CO1" aria-label="Outcome code" maxLength={20} value={code} onChange={(event)=>setCode(event.target.value)}/>
        <input className="input-base" placeholder="Learners can explain…" aria-label="Outcome title" maxLength={180} value={title} onChange={(event)=>setTitle(event.target.value)}/>
        <label className="text-xs">Target %<input className="input-base mt-1" type="number" min={0} max={100} value={target} onChange={(event)=>setTarget(Number(event.target.value))}/></label></div>
      <button disabled={saving||code.length<2||title.length<3} className="btn-primary mt-4" onClick={()=>save({action:"create",subject_id:subjectId,code,title,target_percent:target},"Course outcome created.")}>Create outcome</button>
    </section>
    {mappingOutcome&&<section className="surface p-5 sm:p-6"><h2 className="text-sm font-semibold">Link assessment to {outcomes.find((item)=>item.id===mappingOutcome)?.code}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]"><select className="input-base" value={assessmentKey} onChange={(event)=>setAssessmentKey(event.target.value)} aria-label="Choose assessment"><option value="">Select assessment…</option>{assessments.map((item)=><option value={item.type+":"+item.id} key={item.id}>{item.type} · {item.title}</option>)}</select><label className="text-xs">Weight<input type="number" min={0.1} max={100} step={0.1} className="input-base mt-1" value={weight} onChange={(event)=>setWeight(Number(event.target.value))}/></label></div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" disabled={saving||!assessmentKey} onClick={()=>save({action:"link",outcome_id:mappingOutcome,resource_type:assessmentKey.split(":")[0],resource_id:assessmentKey.split(":")[1],weight},"Assessment linked.")}>Save mapping</button><button className="btn-secondary" onClick={()=>setMappingOutcome("")}>Cancel</button></div>
    </section>}
    <p className="flex items-start gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={17} className="shrink-0"/>Method: each linked assessment contributes its mean released score percentage, multiplied by its configured mapping weight. Weights are normalized over assessments with released evidence; missing grades are excluded rather than counted as zero. This is indicative attainment, not an accreditation verdict.</p>
  </div>;
}
