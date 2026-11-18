import Link from "next/link";
import { AlertTriangle, Database, ShieldAlert } from "lucide-react";
import type { AcademicIssue } from "@/lib/academic-health";

const messages:Record<AcademicIssue,{title:string;detail:string}>={
  migration:{
    title:"Academic database setup needs an update",
    detail:"This module requires database objects that are not available to the server. No grades or support signals have been inferred from missing data.",
  },
  permissions:{
    title:"Academic database access needs repair",
    detail:"The server could not access required academic records. No academic results are shown until the permission issue is resolved.",
  },
  unavailable:{
    title:"Academic records are temporarily unavailable",
    detail:"A database query failed. Reloading may help after the underlying issue is repaired. We have not substituted empty or invented marks.",
  },
  incomplete:{
    title:"The academic evidence set was incomplete",
    detail:"The server could not safely evaluate every required record. Results are withheld rather than displaying misleading percentages.",
  },
  configuration:{
    title:"Academic reporting server is not configured",
    detail:"A required server-side database connection is unavailable. An administrator must review the server deployment settings.",
  },
};
export function AcademicDataState({area,issue,admin=false}:{
  area:"Student Success"|"Gradebook"|"Outcomes";issue:AcademicIssue;admin?:boolean;
}){
  const item=messages[issue];
  return <section role="alert" aria-live="polite" className="surface mx-auto max-w-3xl p-5 sm:p-8">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600">{issue==="permissions"?<ShieldAlert size={20}/>:issue==="migration"?<Database size={20}/>:<AlertTriangle size={20}/>}</div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{area} is not currently able to show a verified dataset. Existing student records are not changed by this screen.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {admin&&<Link href="/admin/academic-health" className="btn-primary">Open academic diagnostics</Link>}
          <a href="" className="btn-secondary">Reload page</a>
          <Link href="/dashboard" className="btn-secondary">Return to dashboard</Link>
        </div>
        {admin&&<p className="mt-3 text-xs text-[var(--muted)]">Check the required forward SQL patches in the migration guide. Never reset your production database to repair this issue.</p>}
      </div>
    </div>
  </section>;
}
