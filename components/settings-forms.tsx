"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { Profile } from "@/types/database";
import { Field } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { Building2, UserRound, ShieldCheck, KeyRound } from "lucide-react";

export function CollegeSettingsForm({ profile, college }: { profile: Profile; college: any }) {
  const [form,setForm]=useState({name:college?.name??"",email:college?.email??"",phone:college?.phone??""});const [saving,setSaving]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);const res=await fetch("/api/college/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await res.json();if(!res.ok)toast.error(data.error??"Update failed.");else toast.success("College settings saved.");setSaving(false);}
  return <div className="grid max-w-3xl gap-5"><section className="surface p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Building2 size={18}/></div><div><div className="text-sm font-semibold">Institution profile</div><div className="mt-1 text-[11px] text-[var(--muted)]">These details appear in your academic workspace.</div></div></div><form onSubmit={submit} className="mt-6 space-y-4"><Field label="College name"><input className="input-base" required minLength={2} maxLength={140} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="College email"><input className="input-base" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field><Field label="Contact phone"><input className="input-base" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field></div><button className="btn-primary" disabled={saving}>{saving?"Saving…":"Save changes"}</button></form></section><section className="surface p-5"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 text-[var(--green)]"/><div><div className="text-xs font-semibold">Tenant isolation is active</div><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Your workspace is identified internally by a unique college ID. Do not share API secrets or the Supabase service-role key with faculty or students.</p></div></div><div className="mt-3 text-[10px] text-[var(--muted)]">Workspace ID · <code>{profile.college_id}</code></div></section></div>;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [form,setForm]=useState({full_name:profile.full_name,phone:profile.phone??""});const [saving,setSaving]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);const res=await fetch("/api/profile/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await res.json();if(!res.ok)toast.error(data.error??"Update failed.");else toast.success("Profile updated. Refresh the page to see your new name.");setSaving(false);}
  return <div className="surface max-w-2xl p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><UserRound size={18}/></div><div><div className="text-sm font-semibold">Personal information</div><div className="mt-1 text-[11px] text-[var(--muted)]">Update your name and contact number.</div></div></div><form onSubmit={submit} className="mt-6 space-y-4"><Field label="Full name"><input className="input-base" required minLength={2} maxLength={120} value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></Field><Field label="Email address"><input className="input-base" value={profile.email} disabled/><span className="mt-1.5 block text-[10px] text-[var(--muted)]">Email changes are managed through authentication settings.</span></Field><Field label="Phone number"><input className="input-base" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><div className="flex items-center gap-3"><span className="status-pill green capitalize">{profile.role}</span><span className="status-pill">{profile.status}</span></div><button className="btn-primary" disabled={saving}>{saving?"Saving…":"Save profile"}</button></form></div>;
}

export function PasswordChangeForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmPassword("");
      toast.success("Your password has been changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="surface p-5">
    <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><KeyRound size={16}/></div><div><div className="text-sm font-semibold">Change password</div><div className="mt-1 text-[11px] text-[var(--muted)]">Set a new password directly. No email link is needed.</div></div></div>
    <form onSubmit={submit} className="mt-5 max-w-xl space-y-4">
      <Field label="New password"><input className="input-base" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters"/></Field>
      <Field label="Confirm new password"><input className="input-base" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></Field>
      <button className="btn-primary" disabled={saving}>{saving ? "Updating…" : "Change password"}</button>
    </form>
  </section>;
}
