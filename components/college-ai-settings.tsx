"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, Eye, EyeOff, KeyRound, Save } from "lucide-react";

type SettingsState = {
  enabled: boolean;
  model: string;
  configured: boolean;
};

export function CollegeAISettings() {
  const [settings, setSettings] = useState<SettingsState>({
    enabled: false,
    model: "openai/gpt-4o-mini",
    configured: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/ai-settings")
      .then(async (response) => {
        const raw = await response.text();
        let result: { enabled?: boolean; model?: string; configured?: boolean; error?: string } = {};
        if (raw) {
          try {
            result = JSON.parse(raw) as typeof result;
          } catch {
            throw new Error("The server returned an unreadable AI settings response.");
          }
        }
        if (!response.ok) throw new Error(result.error ?? "Could not load AI settings.");
        if (active) setSettings({
          enabled: result.enabled ?? false,
          model: result.model ?? "openai/gpt-4o-mini",
          configured: result.configured ?? false,
        });
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load AI settings."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          model: settings.model,
          api_key: apiKey,
        }),
      });
      const raw = await response.text();
      let result: { enabled?: boolean; model?: string; configured?: boolean; error?: string } = {};
      if (raw) {
        try {
          result = JSON.parse(raw) as typeof result;
        } catch {
          throw new Error("The server returned an unreadable response. Check the application server logs.");
        }
      }
      if (!response.ok) throw new Error(result.error ?? `Could not save AI settings (${response.status}).`);
      setSettings({
        enabled: result.enabled ?? settings.enabled,
        model: result.model ?? settings.model,
        configured: result.configured ?? settings.configured,
      });
      setApiKey("");
      toast.success("College AI settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="surface mx-auto max-w-3xl p-5 sm:p-7">
    <div className="flex items-start gap-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><BrainCircuit size={20}/></div>
      <div>
        <h2 className="text-sm font-semibold">College AI workspace</h2>
        <p className="mt-1 text-xs leading-6 text-[var(--muted)]">Connect a college-owned OpenRouter key to enable private student study help, learning-material summaries, and faculty-only draft answer feedback.</p>
      </div>
    </div>

    {loading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-[var(--surface-2)]" aria-label="Loading AI settings"/> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          OpenRouter API key
          <div className="relative mt-2">
            <KeyRound size={15} className="pointer-events-none absolute top-3.5 left-3 text-[var(--muted)]"/>
            <input
              className="input-base !pl-9 !pr-11"
              type={showKey ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.configured ? "Key saved securely · leave blank to keep" : "Paste the college API key"}
              maxLength={300}
            />
            <button type="button" className="absolute top-2.5 right-2 grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={() => setShowKey((visible) => !visible)} aria-label={showKey ? "Hide API key" : "Show API key"}>
              {showKey ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>
          <span className="mt-1.5 block text-[10px] text-[var(--muted)]">{settings.configured ? "The saved key is never returned to this page." : "The key is encrypted before it is stored."}</span>
        </label>
        <label className="block text-xs font-medium">
          OpenRouter model
          <input className="input-base mt-2" value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} maxLength={120} required/>
          <span className="mt-1.5 block text-[10px] text-[var(--muted)]">Use a model slug enabled for this OpenRouter account.</span>
        </label>
      </div>

      <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <span><span className="block text-xs font-semibold">Enable CampusClass AI</span><span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">Students and faculty can use approved AI workflows when this is on.</span></span>
        <input type="checkbox" className="h-4 w-4 accent-[var(--green)]" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}/>
      </label>

      <div className="mt-5 rounded-2xl border border-[var(--line)] p-4 text-[11px] leading-5 text-[var(--muted)]">
        AI prompts and the minimum relevant course text or written answer are sent to OpenRouter for processing. Student names and email addresses are not included. Answer suggestions are never saved, graded, or released automatically; faculty must review them. Check your college’s privacy and data-processing requirements before enabling this service.
      </div>

      <div className="mt-5 flex justify-end">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save AI settings"}<Save size={14}/></button>
      </div>
    </>}
  </form>;
}
