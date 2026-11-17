import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PasswordChangeForm } from "@/components/settings-forms";
import { ShieldCheck, Moon, LockKeyhole } from "lucide-react";

export default async function SettingsPage() {
  const profile = await requireProfile();
  return <>
    <PageHeader title="Settings" description="Manage the appearance and security basics of your CampusClass account."/>
    <div className="grid max-w-3xl gap-4">
      <section className="surface p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><Moon size={16}/></div><div><div className="text-sm font-semibold">Appearance</div><div className="mt-1 text-[11px] text-[var(--muted)]">Use the appearance control at the bottom of the sidebar to switch between light and dark mode. Your preference is stored by the browser.</div></div></div></section>
      <section className="surface p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><ShieldCheck size={16}/></div><div><div className="text-sm font-semibold">Account security</div><div className="mt-1 text-[11px] text-[var(--muted)]">Change your password here without relying on an email sender.</div></div></div></section>
      <PasswordChangeForm/>
      <section className="surface p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><LockKeyhole size={16}/></div><div><div className="text-sm font-semibold">Role and college membership</div><div className="mt-1 text-[11px] text-[var(--muted)]">Your role is <strong className="capitalize text-[var(--text)]">{profile.role}</strong>. Role and college association are not editable from your profile.</div></div></div><div className="mt-4 text-[10px] text-[var(--muted)]">College workspace ID · <code>{profile.college_id}</code></div></section>
    </div>
  </>;
}
