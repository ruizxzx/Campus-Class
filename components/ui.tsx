import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, ClipboardList, FileText, Inbox } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-[var(--green-strong)] text-white shadow-sm">
      <BookOpen size={17} strokeWidth={2.2} />
    </div>
    {!compact && <div className="leading-none"><div className="text-[15px] font-bold tracking-[-.04em]">CampusClass</div><div className="mt-1 text-[9px] font-semibold tracking-[.15em] text-[var(--muted)] uppercase">Academic workspace</div></div>}
  </div>;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div><h1 className="page-title">{title}</h1>{description && <p className="page-subtitle mt-2 max-w-2xl">{description}</p>}</div>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>;
}

export function StatCard({ label, value, note, icon: Icon, tone = "green" }: { label: string; value: string | number; note?: string; icon: typeof BookOpen; tone?: "green" | "orange" | "neutral" }) {
  const background = tone === "orange" ? "#fff1e8" : tone === "neutral" ? "var(--surface-2)" : "var(--green-soft)";
  const color = tone === "orange" ? "#a75d2b" : "var(--green-strong)";
  return <div className="surface p-5">
    <div className="flex items-start justify-between gap-3"><div className="eyebrow">{label}</div><div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background, color }}><Icon size={17}/></div></div>
    <div className="mt-4 text-[30px] font-semibold leading-none tracking-[-.055em]">{value}</div>
    {note && <div className="mt-2 text-xs text-[var(--muted)]">{note}</div>}
  </div>;
}

export function EmptyState({ title, description, icon = "inbox", action }: { title: string; description: string; icon?: "inbox" | "file" | "class"; action?: ReactNode }) {
  const Icon = icon === "file" ? FileText : icon === "class" ? ClipboardList : Inbox;
  return <div className="flex min-h-[230px] flex-col items-center justify-center px-6 py-10 text-center">
    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--green-soft)] text-[var(--green-strong)]"><Icon size={21}/></div>
    <h3 className="mt-4 text-sm font-semibold">{title}</h3>
    <p className="mt-1.5 max-w-sm text-xs leading-6 text-[var(--muted)]">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function SectionHeading({ title, href, linkText = "View all" }: { title: string; href?: string; linkText?: string }) {
  return <div className="mb-4 flex items-center justify-between"><h2 className="text-[15px] font-semibold tracking-[-.02em]">{title}</h2>{href && <a href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--green)]">{linkText}<ArrowUpRight size={13}/></a>}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-semibold text-[var(--text)]">{label}</span>{children}{hint && <span className="mt-1.5 block text-[11px] text-[var(--muted)]">{hint}</span>}</label>;
}
