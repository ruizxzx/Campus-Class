"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ArrowUpRight, CalendarClock, CheckCircle2, Download, FileText, Megaphone, Paperclip, Pencil, Plus, Send, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Field, EmptyState } from "@/components/ui";
import type { Profile } from "@/types/database";

const allowedTypes = new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","image/jpeg","image/png","text/plain"]);
const maxFileSize = 30 * 1024 * 1024;

export function AssignmentComposer({ profile, classes }: { profile: Profile; classes: any[] }) {
  const router = useRouter();
  const [form,setForm]=useState({class_id:"",title:"",description:"",instructions:"",due_at:"",max_marks:"100",allow_late:false,allow_resubmission:false,work_type:"assignment"});
  const [files,setFiles]=useState<File[]>([]);const [saving,setSaving]=useState(false);
  function chooseFiles(event:React.ChangeEvent<HTMLInputElement>){const selected=Array.from(event.target.files??[]);const invalid=selected.find(f=>!allowedTypes.has(f.type)||f.size>maxFileSize);if(invalid){toast.error(`${invalid.name} is not a supported file or is larger than 30 MB.`);event.target.value="";return;}setFiles(selected.slice(0,8));}
  async function persist(status:"draft"|"published"){
    if (!form.class_id || form.title.trim().length < 2 || !Number.isFinite(Number(form.max_marks)) || Number(form.max_marks) <= 0) {
      toast.error("Choose a class, enter a title, and specify valid maximum marks.");
      return;
    }
    setSaving(true);const supabase=createClient();const uploaded:string[]=[];const assignmentId=crypto.randomUUID();let createdAssignmentId:string|null=null;let publicationCommitted=false;
    try{
      const {data:assignmentAccess,error:accessError}=await supabase.from("class_faculty").select("can_manage_assignments").eq("college_id",profile.college_id).eq("class_id",form.class_id).eq("faculty_id",profile.id).maybeSingle();
      if(accessError){
        if(accessError.code==="42501")throw new Error(`The database denied access to assignment permissions. Apply migrations 006 through 010 in timestamp order to the same Supabase project configured for this app. Database response: ${accessError.message}`);
        throw new Error(`Could not verify assignment permission: ${accessError.message}`);
      }
      if(!assignmentAccess?.can_manage_assignments)throw new Error("This class is not assigned to you with assignment-management permission. Ask an administrator to enable 'Can manage assignments and grades' under Admin > Classes > Assigned faculty and permissions.");
      const {error}=await supabase.from("assignments").insert({id:assignmentId,college_id:profile.college_id,class_id:form.class_id,created_by:profile.id,title:form.title.trim(),description:form.description,instructions:form.instructions,due_at:form.due_at?new Date(form.due_at).toISOString():null,max_marks:Number(form.max_marks),work_type:form.work_type,allow_late:form.allow_late,allow_resubmission:form.allow_resubmission,status:"draft",published_at:null});
      if(error){
        console.error("Assignment creation failed", {code:error.code,message:error.message,details:error.details,hint:error.hint});
        if(error.code==="42501"){
          const databaseResponse=[error.message,error.details,error.hint].filter(Boolean).join(" ");
          throw new Error(`The database rejected the assignment. Apply migrations 006 through 010 in timestamp order to the same Supabase project configured for this app. Database response: ${databaseResponse}`);
        }
        throw new Error(error.message);
      }
      createdAssignmentId=assignmentId;
      for(const file of files){const key=`${profile.college_id}/${form.class_id}/${assignmentId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error:uploadError}=await supabase.storage.from("assignment-references").upload(key,file,{upsert:false,contentType:file.type});if(uploadError)throw new Error(`Could not upload ${file.name}: ${uploadError.message}`);uploaded.push(key);}
      if(uploaded.length){const {error:metaError}=await supabase.from("assignment_attachments").insert(files.map((f,i)=>({college_id:profile.college_id,assignment_id:assignmentId,file_name:f.name,storage_path:uploaded[i],mime_type:f.type,file_size:f.size})));if(metaError)throw new Error(`Attachment metadata failed: ${metaError.message}`);}
      // Keep the assignment private until all reference uploads and records succeed.
      if(status==="published"){
        const {data:published,error:publishError}=await supabase.from("assignments")
          .update({status:"published",published_at:new Date().toISOString()})
          .eq("id",assignmentId).eq("college_id",profile.college_id).select("id").single();
        if(publishError||!published)throw new Error(`Could not publish the completed assignment: ${publishError?.message??"unknown error"}`);
        publicationCommitted=true;
      }
      // Publishing is already committed. A notification network/database error
      // must NEVER trigger the outer catch's destructive draft rollback.
      let notificationsSent=true;
      if(status==="published"){
        try {
          const notice=await fetch(`/api/assignments/${assignmentId}/notify`,{method:"POST"});
          if(!notice.ok){notificationsSent=false;const info=await notice.json().catch(()=>({}));toast.error(info.error??"Assignment published, but in-app notifications failed. Retry from the assignment page.");}
        } catch {
          notificationsSent=false;
          toast.error("Assignment published, but notifications could not be saved. Retry from the assignment page.");
        }
      }
      if(status==="draft")toast.success("Draft saved.");else if(notificationsSent)toast.success("Assignment published. In-app notifications processed.");
      router.push("/faculty/assignments");router.refresh();
    }catch(error){
      if(!publicationCommitted){
        if(uploaded.length)await supabase.storage.from("assignment-references").remove(uploaded);
        if(createdAssignmentId)await supabase.from("assignments").delete().eq("id",createdAssignmentId);
      }
      toast.error(publicationCommitted?"Assignment published, but the page could not refresh. Check your assignments.":error instanceof Error?error.message:"Could not save assignment.");
    }
    finally{setSaving(false);}
  }
  return <form onSubmit={(event)=>{event.preventDefault();void persist("published");}} className="grid gap-5 xl:grid-cols-[1fr_320px]"><div className="surface space-y-5 p-5 sm:p-6"><Field label="Work type"><select className="input-base" value={form.work_type} onChange={e=>setForm({...form,work_type:e.target.value})}><option value="assignment">Assignment</option><option value="project">Project</option></select></Field><Field label={form.work_type==="project"?"Project title":"Assignment title"}><input className="input-base" required minLength={2} maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={form.work_type==="project"?"e.g. Mini project — Database portal":"e.g. Data Structures — Lab Assignment 04"}/></Field><Field label="Class"><select className="input-base" required value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value})}><option value="">Select an assigned class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.subjects?.name??"Subject"} · Section {c.section} · {c.academic_year}</option>)}</select>{!classes.length&&<p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">No eligible classes are assigned to your account. Ask an administrator to enable assignment management for one of your classes.</p>}</Field><Field label="Description"><textarea className="input-base min-h-24 resize-y" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="A short summary of the task"/></Field><Field label="Instructions"><textarea className="input-base min-h-40 resize-y" value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Explain the requirements, expected format and submission guidelines…"/></Field><Field label="Reference materials"><label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-7 text-center transition-colors hover:border-[var(--green)]"><UploadCloud size={22} className="text-[var(--green)]"/><span className="mt-2 text-xs font-semibold">Click to attach files</span><span className="mt-1 text-[10px] text-[var(--muted)]">PDF, DOC/DOCX, PPT/PPTX, JPG, PNG, TXT · up to 30 MB each</span><input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.txt" onChange={chooseFiles}/></label>{files.length>0&&<div className="mt-3 space-y-2">{files.map((f)=><div key={f.name} className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[11px]"><Paperclip size={13} className="text-[var(--green)]"/><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-[var(--muted)]">{(f.size/1024/1024).toFixed(1)} MB</span></div>)}</div>}</Field></div><aside className="surface h-fit space-y-4 p-5"><div className="text-sm font-semibold">Submission settings</div><Field label="Deadline"><input type="datetime-local" className="input-base" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></Field><Field label="Maximum marks"><input type="number" className="input-base" min="1" max="100000" step="0.5" required value={form.max_marks} onChange={e=>setForm({...form,max_marks:e.target.value})}/></Field><label className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs"><input type="checkbox" checked={form.allow_late} onChange={e=>setForm({...form,allow_late:e.target.checked})} className="accent-[var(--green)]"/><span><span className="block font-semibold">Allow late submissions</span><span className="mt-0.5 block text-[10px] text-[var(--muted)]">Work received after deadline is marked late.</span></span></label><label className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs"><input type="checkbox" checked={form.allow_resubmission} onChange={e=>setForm({...form,allow_resubmission:e.target.checked})} className="accent-[var(--green)]"/><span><span className="block font-semibold">Allow resubmissions</span><span className="mt-0.5 block text-[10px] text-[var(--muted)]">Students can submit a new version.</span></span></label><div className="border-t border-[var(--line)] pt-4"><button type="button" disabled={saving||!classes.length} onClick={()=>void persist("draft")} className="btn-secondary w-full">Save as draft</button><button type="submit" disabled={saving||!classes.length} className="btn-primary mt-2 w-full">{saving?"Saving…":"Publish assignment"}<Send size={14}/></button></div><p className="text-[10px] leading-5 text-[var(--muted)]">Draft assignments remain visible to faculty only. Published assignments become visible to enrolled students.</p></aside></form>;
}

export function StudentSubmissionForm({ profile, assignment, previousCount }: { profile: Profile; assignment: any; previousCount: number }) {
  const router=useRouter();const [answer,setAnswer]=useState("");const [files,setFiles]=useState<File[]>([]);const [saving,setSaving]=useState(false);
  function pick(event:React.ChangeEvent<HTMLInputElement>){const selected=Array.from(event.target.files??[]);const invalid=selected.find(f=>!allowedTypes.has(f.type)||f.size>maxFileSize);if(invalid){toast.error(`${invalid.name} is not supported or exceeds 30 MB.`);event.target.value="";return;}setFiles(selected.slice(0,8));}
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);const supabase=createClient();const uploaded:{file_name:string;storage_path:string;mime_type:string;file_size:number}[]=[];let submissionRequestStarted=false;
    try{for(const file of files){const path=`${profile.college_id}/${assignment.class_id}/${assignment.id}/${profile.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await supabase.storage.from("student-submissions").upload(path,file,{upsert:false,contentType:file.type});if(error)throw new Error(`Upload failed for ${file.name}: ${error.message}`);uploaded.push({file_name:file.name,storage_path:path,mime_type:file.type,file_size:file.size});}
      submissionRequestStarted=true;
      const response=await fetch(`/api/assignments/${assignment.id}/submit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text_answer:answer,files:uploaded})});const result=await response.json();if(!response.ok)throw new Error(result.error??"Submission failed.");toast.success(result.late?"Submitted and marked late.":"Assignment submitted successfully.");router.refresh();
    }catch(error){
      // A network/response failure does not prove the server failed to save.
      // Once POST starts, never delete files the completed submission may reference.
      if(!submissionRequestStarted&&uploaded.length)await supabase.storage.from("student-submissions").remove(uploaded.map(f=>f.storage_path));
      toast.error(error instanceof Error?error.message:"Submission status uncertain. Check your latest submission before retrying.");
    }
    finally{setSaving(false);}}
  return <form onSubmit={submit} className="surface p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="text-sm font-semibold">Your work</div><div className="mt-1 text-[11px] text-[var(--muted)]">{previousCount?`Version ${previousCount+1} · ${previousCount} previous submission(s)`:"This will be your first submission."}</div></div><span className="status-pill green">{assignment.allow_resubmission?"Resubmission enabled":"Single submission"}</span></div><Field label="Written answer"><textarea className="input-base min-h-36 resize-y" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Write your answer here…"/></Field><div className="mt-5"><Field label="Attachments"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4"><UploadCloud size={18} className="text-[var(--green)]"/><span><span className="block text-xs font-semibold">Choose files</span><span className="mt-1 block text-[10px] text-[var(--muted)]">Up to 8 files, 30 MB each</span></span><input className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.txt" onChange={pick}/></label>{files.length>0&&<div className="mt-3 space-y-2">{files.map(file=><div key={file.name} className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[11px]"><Paperclip size={13} className="text-[var(--green)]"/><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-[var(--muted)]">{(file.size/1024/1024).toFixed(1)} MB</span></div>)}</div>}</Field></div><button className="btn-primary mt-6 w-full sm:w-auto" disabled={saving||(!answer.trim()&&!files.length)||Boolean(previousCount&&!assignment.allow_resubmission)}>{saving?"Submitting…":"Submit assignment"}<Send size={14}/></button></form>;
}

export function StudentSubmissionEditor({ submission, isGraded, isClosed = false }: { submission: { id: string; version: number; text_answer: string | null; attachments: { id: string; file_name: string }[] }; isGraded: boolean; isClosed?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(submission.text_answer ?? "");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_answer: answer }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update your submission.");
      toast.success("Submission updated.");
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your submission.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Latest submission · Version {submission.version}</div>
        <div className="mt-1 text-[10px] text-[var(--muted)]">{isGraded ? "Graded submissions cannot be edited." : isClosed ? "The submission deadline has passed; editing is closed." : "You can edit this submission until it is graded. Existing attachments will remain unchanged."}</div>
      </div>
      {!isGraded && !isClosed && !editing && <button type="button" onClick={() => setEditing(true)} className="btn-secondary"><Pencil size={14}/>Edit submission</button>}
    </div>
    {editing ? <form onSubmit={save} className="mt-4">
      <Field label="Written answer"><textarea className="input-base min-h-36 resize-y" maxLength={30000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write your answer here…"/></Field>
      {submission.attachments.length > 0 && <p className="mt-2 text-[10px] text-[var(--muted)]">Existing attached files: {submission.attachments.map((file) => file.file_name).join(", ")}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={() => { setAnswer(submission.text_answer ?? ""); setEditing(false); }} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving || (!answer.trim() && !submission.attachments.length)} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form> : <div className="mt-4">
      <p className="whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{submission.text_answer || "No written answer."}</p>
      {submission.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{submission.attachments.map((file) => <span key={file.id} className="btn-secondary !px-3 !py-2 text-[10px]"><Paperclip size={13}/>{file.file_name}</span>)}</div>}
    </div>}
  </section>;
}

export function EvaluationTable({ submissions, canEvaluate = true }: { submissions: any[]; canEvaluate?: boolean }) {
  const router=useRouter();
  const [values,setValues]=useState<Record<string,{marks:string;feedback:string}>>(()=>Object.fromEntries(submissions.map(s=>[s.id,{marks:s.evaluation?.marks?.toString()??"",feedback:s.evaluation?.feedback??""}])));
  const [busy,setBusy]=useState<string>("");
  const [suggesting,setSuggesting]=useState<string>("");
  const [rationales,setRationales]=useState<Record<string,string>>({});
  async function save(id:string,release:boolean){
    const current=values[id];if(!current||current.marks===""){toast.error("Enter marks before saving.");return;}
    setBusy(id);
    try {
      const response=await fetch(`/api/submissions/${id}/evaluate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({marks:Number(current.marks),feedback:current.feedback,release})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error??"Could not save evaluation.");
      if(result.warning)toast.warning(result.warning);
      else toast.success(release?"Evaluation released to student.":result.released?"Evaluation updated; it remains visible to the student.":"Evaluation saved privately.");
      router.refresh();
    }catch(error){toast.error(error instanceof Error?error.message:"Could not save evaluation.");}
    finally{setBusy("");}
  }
  async function draftWithAI(submissionId:string){
    setSuggesting(submissionId);
    try{
      const response=await fetch("/api/ai/evaluate-submission",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({submission_id:submissionId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Could not draft AI feedback.");
      setValues(current=>({...current,[submissionId]:{marks:String(result.suggestion.marks),feedback:result.suggestion.feedback}}));
      setRationales(current=>({...current,[submissionId]:result.suggestion.rationale}));
      toast.success("AI draft added. Review and edit it before saving.");
    }catch(error){toast.error(error instanceof Error?error.message:"Could not draft AI feedback.");}
    finally{setSuggesting("");}
  }
  if(!submissions.length)return <div className="surface"><EmptyState title="No submissions yet" description="Student work will appear here after assignments are submitted." icon="file"/></div>;
  return <div className="space-y-3">{submissions.map(s=>{const rowCanEvaluate=canEvaluate&&s.canEvaluate!==false;return <article key={s.id} className="surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">{s.student?.full_name??"Student"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{s.student?.email} · {s.assignment?.title} · Version {s.version}</div><div className="mt-2 flex flex-wrap gap-2"><span className={`status-pill ${s.status==="late"?"orange":"green"}`}>{s.status}</span><span className="status-pill">{format(new Date(s.submitted_at), "dd/MM/yyyy HH:mm")}</span></div></div><div className="text-right"><div className="text-[10px] text-[var(--muted)]">Maximum marks</div><div className="text-lg font-semibold">{s.assignment?.max_marks}</div></div></div>
    {s.text_answer&&<div className="mt-4 rounded-xl bg-[var(--surface-2)] p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Written answer</div><p className="whitespace-pre-wrap text-xs leading-6">{s.text_answer}</p></div>}
    {s.attachments?.length>0&&<div className="mt-3 flex flex-wrap gap-2">{s.attachments.map((f:any)=><button key={f.id} onClick={async()=>{const supabase=createClient();const {data,error}=await supabase.storage.from("student-submissions").createSignedUrl(f.storage_path,300);if(error||!data?.signedUrl){toast.error("File access denied or expired.");return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");}} className="btn-secondary !px-3 !py-2 text-[10px]"><Download size={13}/>{f.file_name}</button>)}</div>}
    {rowCanEvaluate ? <><div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[150px_1fr]"><Field label="Marks"><input className="input-base" type="number" min="0" max={s.assignment?.max_marks} step="0.5" value={values[s.id]?.marks??""} onChange={e=>setValues(v=>({...v,[s.id]:{marks:e.target.value,feedback:v[s.id]?.feedback??""}}))} placeholder={`Out of ${s.assignment?.max_marks}`}/></Field><Field label="Private feedback"><textarea className="input-base min-h-[76px]" value={values[s.id]?.feedback??""} onChange={e=>setValues(v=>({...v,[s.id]:{marks:v[s.id]?.marks??"",feedback:e.target.value}}))} placeholder="Feedback visible to the student after release"/></Field></div>{rationales[s.id]&&<p className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-[10px] leading-5 text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">AI rationale · review required:</span> {rationales[s.id]}</p>}<div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={suggesting===s.id||!s.text_answer?.trim()} onClick={()=>void draftWithAI(s.id)} className="btn-secondary"><Sparkles size={14}/>{suggesting===s.id?"Drafting…":"Draft with AI"}</button><button disabled={busy===s.id} onClick={()=>void save(s.id,false)} className="btn-secondary">Save privately</button><button disabled={busy===s.id} onClick={()=>void save(s.id,true)} className="btn-primary">{busy===s.id?"Saving…":"Release evaluation"}<CheckCircle2 size={14}/></button></div></> : <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">You have view-only access to this class. An administrator must grant evaluation permission before you can grade submissions.</p>}
  </article>})}</div>;
}

export function AnnouncementComposer({ profile, classes, announcements }: { profile: Profile; classes: any[]; announcements: any[] }) {
  const [items,setItems]=useState(announcements);
  const [form,setForm]=useState({class_id:"",title:"",body:""});
  const [editingId,setEditingId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const router=useRouter();

  function clearForm(){setForm({class_id:"",title:"",body:""});setEditingId(null);}
  async function publish(e:React.FormEvent){
    e.preventDefault();
    setSaving(true);
    const supabase=createClient();
    if(editingId){
      const {data,error}=await supabase.from("announcements").update({class_id:form.class_id,title:form.title,body:form.body}).eq("id",editingId).select("id,title,body,published_at,class_id,author_id").single();
      if(error)toast.error("Could not update this announcement.");
      else{setItems(current=>current.map(item=>item.id===editingId?data:item));clearForm();toast.success("Announcement updated.");router.refresh();}
    }else{
      const {data,error}=await supabase.from("announcements").insert({college_id:profile.college_id,class_id:form.class_id,author_id:profile.id,title:form.title,body:form.body}).select("id,title,body,published_at,class_id,author_id").single();
      if(error)toast.error(error.message);
      else{
        setItems(current=>[data,...current]);
        clearForm();
        toast.success("Announcement published.");
        try {
          const notice=await fetch(`/api/announcements/${data.id}/notify`,{method:"POST"});
          if(!notice.ok){const info=await notice.json().catch(()=>({}));toast.error(info.error??"Announcement published, but in-app notifications failed. You can retry.");}
        } catch { toast.error("Announcement published, but notification delivery failed. Retry notifications."); }
      }
    }
    setSaving(false);
  }

  async function remove(id:string){
    if(!window.confirm("Delete this announcement? This cannot be undone."))return;
    const {error}=await createClient().from("announcements").delete().eq("id",id);
    if(error){toast.error("You do not have permission to delete this announcement.");return;}
    setItems(current=>current.filter(item=>item.id!==id));
    if(editingId===id)clearForm();
    toast.success("Announcement deleted.");
  }

  return <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
    <section className="surface p-5 sm:p-6">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Megaphone size={18}/></div><div><div className="text-sm font-semibold">{editingId?"Edit announcement":"New announcement"}</div><div className="mt-1 text-[11px] text-[var(--muted)]">Share an update with a selected class.</div></div></div>
      <form onSubmit={publish} className="mt-5 space-y-4">
        <Field label="Class"><select className="input-base" required value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value})}><option value="">Select a class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.subjects?.name??"Class"} · Section {c.section}</option>)}</select></Field>
        <Field label="Title"><input className="input-base" required minLength={2} maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Announcement title"/></Field>
        <Field label="Message"><textarea className="input-base min-h-36" required value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Write your announcement…"/></Field>
        <button className="btn-primary w-full" disabled={saving||!classes.length}>{saving?(editingId?"Saving…":"Publishing…"):(editingId?"Save changes":"Publish announcement")}<Send size={14}/></button>
        {editingId&&<button type="button" className="btn-secondary w-full" onClick={clearForm}>Cancel editing</button>}
      </form>
    </section>
    <section className="surface p-5 sm:p-6">
      <div className="mb-4 text-sm font-semibold">Recent announcements</div>
      <div className="space-y-3">
        {items.length?items.map(a=><article key={a.id} className="rounded-xl border border-[var(--line)] p-4">
          <div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold">{a.title}</div><span className="status-pill">{format(new Date(a.published_at), "dd/MM/yyyy")}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{a.body}</p>
          {(profile.role==="admin"||a.author_id===profile.id)&&<div className="mt-3 flex justify-end gap-2 border-t border-[var(--line)] pt-3"><button type="button" onClick={()=>{setEditingId(a.id);setForm({class_id:a.class_id,title:a.title,body:a.body});}} className="btn-secondary !px-3 !py-2 text-[10px]">Edit</button><button type="button" onClick={()=>void remove(a.id)} className="btn-danger !px-3 !py-2 text-[10px]">Delete</button></div>}
        </article>):<EmptyState title="No announcements" description="Published class updates will appear here."/>}
      </div>
    </section>
  </div>;
}

export function JoinClassForm() {
  const router=useRouter();const [code,setCode]=useState("");const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setLoading(true);const response=await fetch("/api/classes/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});const data=await response.json();if(!response.ok)toast.error(data.error??"Could not join this class.");else{toast.success("You joined the class.");router.push("/classes");router.refresh();}setLoading(false);}
  return <form onSubmit={submit} className="surface mx-auto max-w-xl p-6 sm:p-8"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]"><Plus size={22}/></div><h2 className="mt-4 text-center text-lg font-semibold">Join a class</h2><p className="mt-2 text-center text-xs leading-6 text-[var(--muted)]">Enter the enrollment code shared by your college faculty or administrator.</p><Field label="Class enrollment code"><input className="input-base mt-1 text-center text-lg font-semibold uppercase tracking-[.14em]" required minLength={5} maxLength={40} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="CC-XXXXXXXX"/></Field><button className="btn-primary mt-4 w-full" disabled={loading}>{loading?"Joining…":"Join class"}<ArrowUpRight size={14}/></button></form>;
}

export function AssignmentEditor({ assignment }: { assignment: any }) {
  const router=useRouter();const [form,setForm]=useState({title:assignment.title,description:assignment.description??"",instructions:assignment.instructions??"",due_at:assignment.due_at?new Date(assignment.due_at).toISOString().slice(0,16):"",max_marks:String(assignment.max_marks),allow_late:Boolean(assignment.allow_late),allow_resubmission:Boolean(assignment.allow_resubmission),status:assignment.status});const [saving,setSaving]=useState(false);
  async function save(e:React.FormEvent){e.preventDefault();setSaving(true);const supabase=createClient();const {error}=await supabase.from("assignments").update({title:form.title,description:form.description,instructions:form.instructions,due_at:form.due_at?new Date(form.due_at).toISOString():null,max_marks:Number(form.max_marks),allow_late:form.allow_late,allow_resubmission:form.allow_resubmission,status:form.status,published_at:form.status==="published"?(assignment.published_at??new Date().toISOString()):null}).eq("id",assignment.id);if(error)toast.error(error.message);else{if(assignment.status!=="published"&&form.status==="published"){try{const response=await fetch(`/api/assignments/${assignment.id}/notify`,{method:"POST"});if(!response.ok){const info=await response.json().catch(()=>({}));toast.error(info.error??"Assignment saved, but notifications failed. Retry below.");}else toast.success("Assignment published. Notifications processed.");}catch{toast.error("Assignment saved, but notifications failed. Retry below.");}}else toast.success("Assignment updated.");router.refresh();}setSaving(false);}
  async function retryNotifications(){
    setSaving(true);
    try {
      const response=await fetch(`/api/assignments/${assignment.id}/notify`,{method:"POST"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error??"Could not retry in-app notifications.");
      toast.success(result.notified ? `${result.notified} in-app notification(s) added.` : "Notifications are up to date.");
    }catch(error){toast.error(error instanceof Error?error.message:"Could not retry notifications.");}
    finally{setSaving(false);}
  }
  async function archive(){setSaving(true);const {error}=await createClient().from("assignments").update({status:"archived"}).eq("id",assignment.id);if(error)toast.error(error.message);else{toast.success("Assignment archived.");router.push("/faculty/assignments");router.refresh();}setSaving(false);}
  async function remove(){if(!window.confirm("Permanently delete this assignment and all student submissions? This cannot be undone."))return;setSaving(true);try{const response=await fetch(`/api/assignments/${assignment.id}`,{method:"DELETE"});const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not delete the assignment.");if(result.warning)toast.error(result.warning);else toast.success("Assignment and its submissions deleted.");router.push("/faculty/assignments");router.refresh();}catch(error){toast.error(error instanceof Error?error.message:"Could not delete the assignment.");}finally{setSaving(false);}}
  return <details className="surface mb-5 p-5"><summary className="cursor-pointer list-none text-xs font-semibold">Edit assignment <span className="ml-2 text-[10px] font-normal text-[var(--muted)]">(expand)</span></summary><form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Title"><input className="input-base" required maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Maximum marks"><input className="input-base" type="number" min="1" step="0.5" value={form.max_marks} onChange={e=>setForm({...form,max_marks:e.target.value})}/></Field><Field label="Deadline"><input className="input-base" type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></Field><Field label="Publication status"><select className="input-base" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field><div className="md:col-span-2"><Field label="Description"><textarea className="input-base min-h-20" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field></div><div className="md:col-span-2"><Field label="Instructions"><textarea className="input-base min-h-28" value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})}/></Field></div><div className="flex flex-wrap gap-4 md:col-span-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.allow_late} onChange={e=>setForm({...form,allow_late:e.target.checked})} className="accent-[var(--green)]"/>Allow late submissions</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.allow_resubmission} onChange={e=>setForm({...form,allow_resubmission:e.target.checked})} className="accent-[var(--green)]"/>Allow resubmissions</label></div><div className="flex flex-wrap justify-between gap-2 md:col-span-2"><div className="flex flex-wrap gap-2">{assignment.status==="published"&&<button type="button" disabled={saving} onClick={()=>void retryNotifications()} className="btn-secondary">Retry student notifications</button>}<button type="button" disabled={saving||assignment.status==="archived"} onClick={()=>void archive()} className="btn-secondary">Archive assignment</button><button type="button" disabled={saving} onClick={()=>void remove()} className="btn-danger"><Trash2 size={14}/>{saving?"Working…":"Delete assignment"}</button></div><button className="btn-primary" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div></form></details>;
}
