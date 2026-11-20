"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, Search, Trash2, UserPlus, Users, Building2, BookOpen, School, X } from "lucide-react";
import { EmptyState, Field } from "@/components/ui";

function Panel({ children }: { children: React.ReactNode }) { return <div className="surface p-5 sm:p-6">{children}</div>; }

function generateTemporaryPassword() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure password generation is not available in this browser.");
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

export function InviteManager({ profile, role }: { profile: Profile; role: "faculty" | "student" }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [credentials, setCredentials] = useState<{ email: string; password: string; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [sendSetupEmail, setSendSetupEmail] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("id,full_name,email,status,created_at").eq("college_id", profile.college_id).eq("role", role).order("created_at", { ascending: false });
    if (error) toast.error("Could not load college members."); else setRows(data ?? []);
    setLoading(false);
  }, [profile.college_id, role]);
  useEffect(() => { void load(); }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setCredentials(null);
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, role, send_setup_email: sendSetupEmail }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Account creation failed.");
      setCredentials({ email: form.email.trim().toLowerCase(), password: form.password, message: result.message });
      setForm({ full_name: "", email: "", password: "" }); setShowPassword(false); toast.success("Member account created.");
      if (result.warning) toast.warning(result.warning);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create account."); }
    finally { setSaving(false); }
  }

  const filtered = rows.filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
    <Panel>
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><UserPlus size={18}/></div><div><div className="text-sm font-semibold">Create {role} account</div><div className="mt-1 text-[11px] text-[var(--muted)]">Creates an active account immediately. Optionally send a password setup email via college SMTP.</div></div></div>
      <form onSubmit={invite} className="mt-5 space-y-4">
        <Field label="Full name"><input className="input-base" required minLength={2} maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Enter full name"/></Field>
        <Field label="Email address"><input className="input-base" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@college.edu"/></Field>
        <Field label="Temporary password"><div className="relative"><input className="input-base pr-11" required type={showPassword ? "text" : "password"} minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters"/><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((visible) => !visible)} className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--muted)]">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div><button type="button" onClick={() => { try { setForm((current) => ({ ...current, password: generateTemporaryPassword() })); setShowPassword(true); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate a secure password."); } }} className="mt-2 text-[10px] font-semibold text-[var(--green)]">Generate temporary password</button></Field>
        <label className="flex items-start gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" className="mt-0.5" checked={sendSetupEmail}
            onChange={e=>setSendSetupEmail(e.target.checked)} disabled={saving}/>
          Email the new member a secure password-setup link (requires Supabase Auth SMTP).
        </label>
        <button className="btn-primary w-full" disabled={saving}>{saving ? "Creating account…" : "Create account"}<Plus size={15}/></button>
      </form>
      {credentials && <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <div className="text-xs font-semibold">Account created — share these credentials securely</div>
        <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">{credentials.message}</p>
        <div className="mt-3 space-y-2 text-xs"><div><span className="font-semibold">Email: </span>{credentials.email}</div><div><span className="font-semibold">Temporary password: </span><code>{credentials.password}</code></div></div>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`Email: ${credentials.email}\nTemporary password: ${credentials.password}`); toast.success("Credentials copied."); } catch { toast.error("Clipboard access failed. Copy the credentials manually."); } }} className="btn-secondary mt-3 w-full"><Copy size={14}/>Copy credentials</button>
        <p className="mt-2 text-[10px] text-[var(--muted)]">The member can change their password and profile details after signing in.</p>
      </div>}
    </Panel>
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold">{role === "faculty" ? "Faculty directory" : "Student directory"}</div><div className="mt-1 text-[11px] text-[var(--muted)]">{rows.length} active and inactive accounts</div></div><button onClick={() => { setLoading(true); void load(); }} className="btn-secondary !p-2.5" aria-label="Refresh"><RefreshCw size={14}/></button></div>
      <div className="relative mb-4"><Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"/><input className="input-base !pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
      {loading ? <div className="space-y-3">{[1,2,3].map((n)=><div key={n} className="h-12 animate-pulse rounded-xl bg-[var(--surface-2)]"/>)}</div> : filtered.length ? <div className="space-y-2">{filtered.map((r)=><div key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--green-soft)] text-xs font-bold text-[var(--green)]">{r.full_name.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{r.full_name}</div><div className="mt-1 truncate text-[10px] text-[var(--muted)]">{r.email}</div></div><span className={`status-pill ${r.status === "active" ? "green" : "orange"}`}>{r.status}</span><button onClick={async()=>{const next=r.status==="active"?"inactive":"active";const response=await fetch(`/api/members/${r.id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});const result=await response.json();if(!response.ok)toast.error(result.error??"Could not update status.");else{toast.success(`Member ${next}.`);await load();}}} className="btn-secondary !px-2.5 !py-2 text-[10px]">{r.status === "active" ? "Deactivate" : "Activate"}</button></div>)}</div> : <EmptyState title="No matching accounts" description="New members appear here after their account is created."/>}
    </Panel>
    <MemberPasswordResetPanel members={rows}/>
  </div>;
}

type ResettableMember = Pick<Profile, "id" | "full_name" | "email">;

function MemberPasswordResetPanel({ members }: { members: ResettableMember[] }) {
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const selectedMember = members.find((member) => member.id === memberId) ?? members[0];

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    setSaving(true);
    setCredentials(null);
    try {
      const response = await fetch(`/api/members/${selectedMember.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reset the password.");
      setCredentials({ email: selectedMember.email, password });
      setPassword("");
      setShowPassword(false);
      toast.success("Password reset. Share the temporary credentials securely.");
      if (result.warning) toast.warning(result.warning);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset the password.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="surface p-5 sm:p-6 xl:col-span-2">
    <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><KeyRound size={18}/></div><div><div className="text-sm font-semibold">Reset a member password</div><div className="mt-1 text-[11px] text-[var(--muted)]">Set a temporary password directly. No reset email is sent.</div></div></div>
    <form onSubmit={resetPassword} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Member"><select className="input-base" required disabled={!members.length} value={selectedMember?.id ?? ""} onChange={(event) => { setMemberId(event.target.value); setCredentials(null); }}><option value="" disabled>Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.email}</option>)}</select></Field>
      <Field label="New temporary password"><div className="relative"><input className="input-base pr-11" type={showPassword ? "text" : "password"} required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters"/><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((visible) => !visible)} className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--muted)]">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div><button type="button" onClick={() => { try { setPassword(generateTemporaryPassword()); setShowPassword(true); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate a secure password."); } }} className="mt-2 text-[10px] font-semibold text-[var(--green)]">Generate temporary password</button></Field>
      <button className="btn-primary" disabled={saving || !selectedMember}>{saving ? "Resetting…" : "Reset password"}</button>
    </form>
    {credentials && <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs">
      <div className="font-semibold">New sign-in credentials</div>
      <div className="mt-2">Email: {credentials.email}</div>
      <div className="mt-1">Temporary password: <code>{credentials.password}</code></div>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`Email: ${credentials.email}\nTemporary password: ${credentials.password}`); toast.success("Credentials copied."); } catch { toast.error("Clipboard access failed. Copy the credentials manually."); } }} className="btn-secondary mt-3"><Copy size={14}/>Copy credentials</button>
    </div>}
  </div>;
}

export function DepartmentManager({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<any[]>([]); const [form, setForm] = useState({ name: "", code: "", description: "" }); const [saving, setSaving] = useState(false);
  async function load() { const { data, error } = await createClient().from("departments").select("*").eq("college_id", profile.college_id).order("name"); if (error) toast.error("Could not load departments."); else setRows(data ?? []); }
  useEffect(() => { void load(); }, [profile.college_id]);
  async function add(e: React.FormEvent) { e.preventDefault(); setSaving(true); const { error } = await createClient().from("departments").insert({ ...form, college_id: profile.college_id }); if (error) toast.error(error.message); else { toast.success("Department created."); setForm({ name: "", code: "", description: "" }); await load(); } setSaving(false); }
  async function toggle(row: any) { const { error } = await createClient().from("departments").update({ is_active: !row.is_active }).eq("id", row.id); if (error) toast.error(error.message); else { toast.success("Department updated."); await load(); } }
  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Panel><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Building2 size={18}/></div><div className="text-sm font-semibold">Add department</div></div><form className="mt-5 space-y-4" onSubmit={add}><Field label="Department name"><input className="input-base" required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Computer Science"/></Field><Field label="Department code"><input className="input-base" required value={form.code} onChange={(e)=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="CSE"/></Field><Field label="Description"><textarea className="input-base min-h-24 resize-y" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} placeholder="Optional department details"/></Field><button className="btn-primary w-full" disabled={saving}>{saving ? "Saving…" : "Create department"}<Plus size={14}/></button></form></Panel><Panel><div className="mb-4 flex justify-between"><div><div className="text-sm font-semibold">Departments</div><div className="mt-1 text-[11px] text-[var(--muted)]">{rows.length} records</div></div><button onClick={()=>void load()} className="btn-secondary !p-2.5"><RefreshCw size={14}/></button></div><div className="space-y-2">{rows.length ? rows.map((r)=><div key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-2)] text-xs font-bold">{r.code.slice(0,3)}</div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{r.name}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{r.code} {r.description ? `· ${r.description}` : ""}</div></div><span className={`status-pill ${r.is_active ? "green" : "orange"}`}>{r.is_active ? "Active" : "Inactive"}</span><button onClick={()=>void toggle(r)} className="btn-secondary !px-2.5 !py-2 text-[10px]">{r.is_active ? "Deactivate" : "Activate"}</button></div>) : <EmptyState title="No departments yet" description="Add your first department to start organizing subjects."/>}</div></Panel></div>;
}

export function SubjectManager({ profile }: { profile: Profile }) {
  const [rows,setRows]=useState<any[]>([]); const [departments,setDepartments]=useState<any[]>([]); const [form,setForm]=useState({name:"",code:"",department_id:"",semester:"1",academic_year:"2026-2027",description:""}); const [saving,setSaving]=useState(false);
  async function load(){const supabase=createClient();const [d,s]=await Promise.all([supabase.from("departments").select("id,name,code").eq("college_id",profile.college_id).eq("is_active",true).order("name"),supabase.from("subjects").select("*,departments(name,code)").eq("college_id",profile.college_id).order("name")]);setDepartments(d.data??[]);setRows(s.data??[]);}
  useEffect(()=>{void load();},[profile.college_id]);
  async function add(e:React.FormEvent){e.preventDefault();setSaving(true);const {error}=await createClient().from("subjects").insert({college_id:profile.college_id,name:form.name,code:form.code.toUpperCase(),department_id:form.department_id,semester:Number(form.semester),academic_year:form.academic_year,description:form.description});if(error)toast.error(error.message);else{toast.success("Subject created.");setForm({...form,name:"",code:"",description:""});await load();}setSaving(false);}
  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Panel><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><BookOpen size={18}/></div><div className="text-sm font-semibold">Create subject</div></div><form className="mt-5 space-y-4" onSubmit={add}><Field label="Subject name"><input className="input-base" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Data Structures"/></Field><Field label="Subject code"><input className="input-base" required value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="CS301"/></Field><Field label="Department"><select className="input-base" required value={form.department_id} onChange={e=>setForm({...form,department_id:e.target.value})}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Semester"><select className="input-base" value={form.semester} onChange={e=>setForm({...form,semester:e.target.value})}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></Field><Field label="Academic year"><input className="input-base" required value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})}/></Field></div><Field label="Description"><textarea className="input-base min-h-20" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field><button className="btn-primary w-full" disabled={saving||!departments.length}>{saving?"Saving…":"Create subject"}<Plus size={14}/></button>{!departments.length&&<p className="text-[10px] text-[var(--muted)]">Create an active department first.</p>}</form></Panel><Panel><div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-semibold">Subjects</div><div className="mt-1 text-[11px] text-[var(--muted)]">{rows.length} catalogued</div></div><button onClick={()=>void load()} className="btn-secondary !p-2.5"><RefreshCw size={14}/></button></div><div className="table-wrap"><table className="table-base"><thead><tr><th>Subject</th><th>Department</th><th>Semester</th><th>Year</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.id}><td><div className="font-semibold">{r.name}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{r.code}</div></td><td>{r.departments?.name??"—"}</td><td>{r.semester??"—"}</td><td>{r.academic_year??"—"}</td></tr>):<tr><td colSpan={4}><EmptyState title="No subjects yet" description="Create subjects under one of your departments."/></td></tr>}</tbody></table></div></Panel></div>;
}

export function ClassManager({ profile }: { profile: Profile }) {
  const [classes,setClasses]=useState<any[]>([]);const [subjects,setSubjects]=useState<any[]>([]);const [faculty,setFaculty]=useState<any[]>([]);const [form,setForm]=useState({subject_id:"",section:"A",academic_year:"2026-2027",semester:"1",faculty_id:"",can_manage_assignments:false});const [saving,setSaving]=useState(false);const [newCode,setNewCode]=useState("");
  async function load(){const supabase=createClient();const [c,s,f]=await Promise.all([supabase.from("classes").select("*,subjects(name,code),class_enrollments(count)").eq("college_id",profile.college_id).order("created_at",{ascending:false}),supabase.from("subjects").select("id,name,code,semester,academic_year").eq("college_id",profile.college_id).eq("is_active",true).order("name"),supabase.from("profiles").select("id,full_name,email").eq("college_id",profile.college_id).eq("role","faculty").eq("status","active").order("full_name")]);setClasses(c.data??[]);setSubjects(s.data??[]);setFaculty(f.data??[]);}
  useEffect(()=>{void load();},[profile.college_id]);
  async function add(e:React.FormEvent){e.preventDefault();setSaving(true);const subject=subjects.find(s=>s.id===form.subject_id);const supabase=createClient();const {data,error}=await supabase.from("classes").insert({college_id:profile.college_id,subject_id:form.subject_id,section:form.section.trim().toUpperCase(),academic_year:form.academic_year,semester:Number(form.semester),created_by:profile.id}).select("id").single();if(error||!data){toast.error(error?.message??"Could not create class.");setSaving(false);return;}if(form.faculty_id){const {error:assignError}=await supabase.from("class_faculty").insert({college_id:profile.college_id,class_id:data.id,faculty_id:form.faculty_id,can_manage_assignments:form.can_manage_assignments});if(assignError)toast.error(`Class created, but faculty assignment failed: ${assignError.message}`);}
    const response=await fetch(`/api/classes/${data.id}/enrollment-code`,{method:"POST"});const result=await response.json();if(response.ok){setNewCode(result.code);toast.success(`Class created: ${subject?.name??"Class"}`);}else toast.error(result.error??"Class created, but code generation failed.");setForm({...form,section:"A",faculty_id:"",can_manage_assignments:false});await load();setSaving(false);}
  async function rotateCode(id:string){const response=await fetch(`/api/classes/${id}/enrollment-code`,{method:"POST"});const result=await response.json();if(!response.ok)toast.error(result.error);else{setNewCode(result.code);toast.success("Enrollment code rotated.");}}
  async function toggle(row:any){const {error}=await createClient().from("classes").update({enrollment_open:!row.enrollment_open}).eq("id",row.id);if(error)toast.error(error.message);else{toast.success(row.enrollment_open?"Enrollment closed.":"Enrollment opened.");await load();}}
  return <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><Panel><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><School size={18}/></div><div className="text-sm font-semibold">Create class section</div></div><form onSubmit={add} className="mt-5 space-y-4"><Field label="Subject"><select className="input-base" required value={form.subject_id} onChange={e=>{const sub=subjects.find(s=>s.id===e.target.value);setForm({...form,subject_id:e.target.value,semester:String(sub?.semester??1),academic_year:sub?.academic_year??form.academic_year});}}><option value="">Choose subject</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Section"><input className="input-base" required maxLength={16} value={form.section} onChange={e=>setForm({...form,section:e.target.value})}/></Field><Field label="Semester"><input className="input-base" type="number" min="1" max="12" required value={form.semester} onChange={e=>setForm({...form,semester:e.target.value})}/></Field></div><Field label="Academic year"><input className="input-base" required value={form.academic_year} onChange={e=>setForm({...form,academic_year:e.target.value})}/></Field><Field label="Assign faculty (optional)"><select className="input-base" value={form.faculty_id} onChange={e=>setForm({...form,faculty_id:e.target.value,can_manage_assignments:false})}><option value="">Assign later</option>{faculty.map(f=><option key={f.id} value={f.id}>{f.full_name} · {f.email}</option>)}</select></Field>{form.faculty_id&&<label className="flex items-start gap-2 rounded-xl bg-[var(--surface-2)] p-3 text-[11px]"><input type="checkbox" checked={form.can_manage_assignments} onChange={e=>setForm({...form,can_manage_assignments:e.target.checked})} className="mt-0.5 accent-[var(--green)]"/><span><span className="block font-semibold">Grant assignment management and grading</span><span className="mt-0.5 block text-[10px] text-[var(--muted)]">Without this permission, the faculty member can view the class but cannot create, edit or evaluate assignments.</span></span></label>}<button className="btn-primary w-full" disabled={saving||!subjects.length}>{saving?"Creating…":"Create class and enrollment code"}<Plus size={14}/></button></form>{newCode&&<div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--green-soft)] p-4"><div className="text-xs font-semibold text-[var(--green-strong)]">New enrollment code — copy now</div><div className="mt-2 flex items-center justify-between gap-2"><code className="text-lg font-bold tracking-[.12em] text-[var(--green-strong)]">{newCode}</code><button onClick={()=>{void navigator.clipboard.writeText(newCode);toast.success("Code copied.");}} className="btn-secondary !p-2"><Copy size={14}/></button></div><p className="mt-2 text-[10px] text-[var(--muted)]">The full code is shown only once. Regenerating it disables the previous code.</p></div>}</Panel><Panel><div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-semibold">Class sections</div><div className="mt-1 text-[11px] text-[var(--muted)]">{classes.length} class sections</div></div><button onClick={()=>void load()} className="btn-secondary !p-2.5"><RefreshCw size={14}/></button></div><div className="space-y-2">{classes.length?classes.map((c)=><div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--green)]"><BookOpen size={16}/></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{c.subjects?.name??"Subject"} · Section {c.section}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{c.subjects?.code??""} · Semester {c.semester} · {c.academic_year}</div></div><span className="status-pill">{c.class_enrollments?.[0]?.count??0} students</span><button onClick={()=>void rotateCode(c.id)} className="btn-secondary !px-2.5 !py-2 text-[10px]">New code</button><button onClick={()=>void toggle(c)} className="btn-secondary !px-2.5 !py-2 text-[10px]">{c.enrollment_open?"Close join":"Open join"}</button><div className="w-full"><ClassFacultyAssigner profile={profile} classId={c.id} faculty={faculty}/></div></div>):<EmptyState title="No classes yet" description="Create a class section after adding at least one subject."/>}</div></Panel></div><p className="text-[10px] leading-5 text-[var(--muted)]">Faculty can be assigned to additional classes from the class detail screen. Class enrollment codes are stored as one-way hashes and are never returned by normal database reads.</p></div>;
}


export function ClassFacultyAssigner({ profile, classId, faculty }: { profile: Profile; classId: string; faculty: any[] }) {
  const [assigned,setAssigned]=useState<{faculty_id:string;can_manage_assignments:boolean}[]>([]);
  const [selected,setSelected]=useState("");
  const [selectedPermission,setSelectedPermission]=useState(false);
  const [busy,setBusy]=useState(false);
  async function load(){
    const {data,error}=await createClient().from("class_faculty").select("faculty_id,can_manage_assignments").eq("college_id",profile.college_id).eq("class_id",classId);
    if(error)toast.error("Could not load faculty assignments.");else setAssigned(data??[]);
  }
  useEffect(()=>{void load();},[classId,profile.college_id]);
  async function add(){
    if(!selected)return;
    setBusy(true);
    const {error}=await createClient().from("class_faculty").insert({college_id:profile.college_id,class_id:classId,faculty_id:selected,can_manage_assignments:selectedPermission});
    if(error)toast.error(error.code==="23505"?"Faculty member is already assigned.":error.message);
    else{toast.success("Faculty assigned.");setSelected("");setSelectedPermission(false);await load();}
    setBusy(false);
  }
  async function togglePermission(row:{faculty_id:string;can_manage_assignments:boolean}){
    const next=!row.can_manage_assignments;
    const {error}=await createClient().from("class_faculty").update({can_manage_assignments:next}).eq("class_id",classId).eq("faculty_id",row.faculty_id);
    if(error)toast.error("Could not update faculty permissions.");else{toast.success(next?"Assignment management granted.":"Assignment management revoked.");await load();}
  }
  async function remove(id:string){
    const {error}=await createClient().from("class_faculty").delete().eq("class_id",classId).eq("faculty_id",id);
    if(error)toast.error(error.message);else{toast.success("Faculty assignment removed.");await load();}
  }
  const available=faculty.filter(member=>!assigned.some(row=>row.faculty_id===member.id));
  return <div className="mt-3 border-t border-[var(--line)] pt-3">
    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Assigned faculty and permissions</div>
    <div className="space-y-2">
      {assigned.map(row=>{
        const member=faculty.find(item=>item.id===row.faculty_id);
        return <div key={row.faculty_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-2)] p-2.5">
          <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{member?.full_name??"Faculty"}</div><div className="mt-0.5 text-[9px] text-[var(--muted)]">{member?.email??""}</div></div>
          <label className="flex items-center gap-1.5 text-[9px] font-medium text-[var(--muted)]"><input type="checkbox" checked={row.can_manage_assignments} onChange={()=>void togglePermission(row)} className="accent-[var(--green)]"/>Can manage assignments and grades</label>
          <button type="button" onClick={()=>void remove(row.faculty_id)} aria-label="Remove faculty assignment" className="btn-secondary !p-1.5"><X size={12}/></button>
        </div>;
      })}
      {!assigned.length&&<span className="text-[10px] text-[var(--muted)]">No faculty assigned.</span>}
    </div>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <select className="input-base !py-2 text-[11px]" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Add faculty member</option>{available.map(member=><option key={member.id} value={member.id}>{member.full_name}</option>)}</select>
      <label className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-2 text-[10px]"><input type="checkbox" checked={selectedPermission} onChange={e=>setSelectedPermission(e.target.checked)} className="accent-[var(--green)]"/>Grant management</label>
      <button type="button" className="btn-secondary !px-3 !py-2" disabled={!selected||busy} onClick={()=>void add()}><Plus size={13}/>Assign</button>
    </div>
  </div>;
}
