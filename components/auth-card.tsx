"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/ui";
import { safeInternalPath } from "@/lib/safe-navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";

type AuthMode = "login" | "register" | "forgot" | "reset" | "invite";

export function AuthCard({ mode, token = "" }: { mode: AuthMode; token?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ fullName: "", collegeName: "", email: "", password: "", confirmPassword: "" });
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
        if (authError) throw authError;
        const next = new URLSearchParams(window.location.search).get("next");
        router.replace(safeInternalPath(next)); router.refresh();
      } else if (mode === "register") {
        const { error: authError } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(), password: form.password,
          options: { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard`, data: { signup_kind: "college_admin", college_name: form.collegeName.trim(), full_name: form.fullName.trim() } },
        });
        if (authError) throw authError;
        setMessage("Your workspace has been created. Verify your email, then sign in to continue.");
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(form.email.trim().toLowerCase(), { redirectTo: `${appUrl}/auth/callback?next=/reset-password` });
        if (authError) throw authError;
        setMessage("Password reset instructions have been sent when the email address matches an account.");
      } else if (mode === "reset") {
        if (form.password.length < 8) throw new Error("Use at least 8 characters for your password.");
        if (form.password !== form.confirmPassword) throw new Error("The passwords do not match.");
        const { error: authError } = await supabase.auth.updateUser({ password: form.password });
        if (authError) throw authError;
        setMessage("Your password has been updated. You can now continue to your workspace.");
        setTimeout(() => router.replace("/dashboard"), 600);
      } else if (mode === "invite") {
        const invitedEmail = form.email.trim().toLowerCase();
        const invitedName = form.fullName.trim();
        if (!invitedName) throw new Error("Enter your full name to create an account.");
        if (!invitedEmail || form.password.length < 8) throw new Error("Enter the invited email address and a password of at least 8 characters.");

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session && sessionData.session.user.email && sessionData.session.user.email.toLowerCase() !== invitedEmail) {
          throw new Error("The signed-in email does not match the email entered here.");
        }

        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token || undefined, email: invitedEmail, password: form.password, full_name: invitedName }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not accept invitation.");

        if (!sessionData.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitedEmail, password: form.password });
          if (signInError) throw signInError;
        }

        router.replace("/dashboard"); router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  const titles: Record<AuthMode, string> = { login: "Welcome back", register: "Create your college workspace", forgot: "Reset your password", reset: "Set a new password", invite: "Join your college" };
  const descriptions: Record<AuthMode, string> = {
    login: "Sign in to continue to your academic workspace.",
    register: "Set up your institution's private academic workspace.",
    forgot: "Enter your email for a reset link, or contact your college administrator to set a temporary password.",
    reset: "Choose a strong password for your account.",
    invite: "Accept your invitation to access classes, assignments and updates.",
  };

  return <div className="w-full max-w-[440px]">
    <div className="mb-9 flex items-center justify-between"><BrandMark/><Link href="/" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]">CampusClass home</Link></div>
    <div className="surface p-7 sm:p-9">
      <div className="mb-7"><div className="eyebrow">{mode === "register" ? "Institution onboarding" : mode === "invite" ? "Secure invitation" : "CampusClass account"}</div><h1 className="mt-3 text-[27px] font-semibold tracking-[-.045em]">{titles[mode]}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{descriptions[mode]}</p></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "register" && <><label className="block"><span className="mb-2 block text-xs font-semibold">College name</span><input className="input-base" required minLength={2} maxLength={140} placeholder="e.g. JIS College of Engineering" value={form.collegeName} onChange={(e) => update("collegeName", e.target.value)}/></label><label className="block"><span className="mb-2 block text-xs font-semibold">Administrator name</span><input className="input-base" required minLength={2} maxLength={120} placeholder="Your full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)}/></label></>}
        {mode === "invite" && <label className="block"><span className="mb-2 block text-xs font-semibold">Full name</span><input className="input-base" required={mode !== "invite"} minLength={2} maxLength={120} placeholder="Your full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)}/></label>}
        {mode !== "reset" && <label className="block"><span className="mb-2 block text-xs font-semibold">Email address</span><input className="input-base" type="email" required={mode !== "invite"} autoComplete="email" placeholder="name@college.edu" value={form.email} onChange={(e) => update("email", e.target.value)}/></label>}
        {(mode === "login" || mode === "register" || mode === "invite" || mode === "reset") && <label className="block"><span className="mb-2 block text-xs font-semibold">{mode === "reset" ? "New password" : "Password"}</span><div className="relative"><input className="input-base pr-11" type={showPassword ? "text" : "password"} required={mode !== "invite"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" value={form.password} onChange={(e) => update("password", e.target.value)}/><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--muted)]">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>}
        {mode === "reset" && <label className="block"><span className="mb-2 block text-xs font-semibold">Confirm password</span><input className="input-base" type="password" required minLength={8} value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)}/></label>}
        {mode === "login" && <div className="-mt-1 flex justify-end"><Link href="/forgot-password" className="text-xs font-semibold text-[var(--green)]">Forgot password?</Link></div>}
        {error && <div role="alert" className="rounded-xl border border-[#f2d1cb] bg-[#fff5f2] px-3.5 py-3 text-xs leading-5 text-[#a34435]">{error}</div>}
        {message && <div role="status" className="flex gap-2 rounded-xl border border-[var(--line)] bg-[var(--green-soft)] px-3.5 py-3 text-xs leading-5 text-[var(--green-strong)]"><CheckCircle2 size={16} className="mt-0.5 shrink-0"/>{message}</div>}
        <button className="btn-primary mt-2 w-full !py-3" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create workspace" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Accept invitation"}<ArrowRight size={15}/></button>
      </form>
      {mode === "register" && <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--surface-2)] p-3 text-[11px] leading-5 text-[var(--muted)]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--green)]"/>Each college gets a separate workspace. Your account becomes the administrator for the new college only.</div>}
      <div className="mt-6 border-t border-[var(--line)] pt-5 text-center text-xs text-[var(--muted)]">{mode === "login" ? <>New institution? <Link href="/register" className="font-semibold text-[var(--green)]">Create a workspace</Link></> : mode === "register" ? <>Already have a workspace? <Link href="/login" className="font-semibold text-[var(--green)]">Sign in</Link></> : mode === "invite" ? <>Already have an account? <Link href="/login" className="font-semibold text-[var(--green)]">Sign in first</Link>, then reopen this invitation.</> : <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-[var(--green)]"><ArrowLeft size={13}/>Back to sign in</Link>}</div>
    </div>
    <p className="mt-5 text-center text-[10px] text-[var(--muted)]">Secure academic workspace · Your college controls its own data</p>
  </div>;
}
