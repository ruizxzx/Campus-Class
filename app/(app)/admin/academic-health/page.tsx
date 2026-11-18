import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { academicIssueFor, academicLog } from "@/lib/academic-health";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, ExternalLink } from "lucide-react";

export const dynamic="force-dynamic";

const checks:{label:string;table:string;columns:string;migration:string}[]=[
  {label:"College profiles",table:"profiles",columns:"college_id",migration:"Core"},
  {label:"Academic classes",table:"classes",columns:"college_id",migration:"Core"},
  {label:"Quiz attempts",table:"quiz_attempts",columns:"college_id",migration:"Existing"},
  {label:"Attendance sessions",table:"attendance_sessions",columns:"college_id",migration:"026"},
  {label:"Attendance records",table:"attendance_records",columns:"college_id",migration:"026"},
  {label:"Course outcomes",table:"course_outcomes",columns:"college_id",migration:"026"},
  {label:"Outcome assessment maps",table:"outcome_assessments",columns:"college_id",migration:"026"},
  {label:"Student interventions",table:"student_interventions",columns:"college_id",migration:"026"},
  {label:"Quiz timer sessions",table:"quiz_attempt_sessions",columns:"college_id",migration:"027"},
  {label:"Intervention follow-up columns",table:"student_interventions",columns:"action_plan,follow_up_at,outcome_note,resolved_at",migration:"031"},
  {label:"AI Vault key pointer",table:"college_ai_settings",columns:"api_key_vault_id",migration:"032"},
  {label:"Reusable question bank",table:"question_bank_items",columns:"college_id",migration:"033"},
  {label:"Class gradebook policies",table:"class_gradebook_policies",columns:"college_id",migration:"034"},
  {label:"Student Success rules",table:"student_success_rules",columns:"college_id",migration:"035"},
];
const migrations=[
  ["026","202611180026_campusclass_20_academic_intelligence.sql"],
  ["027","202611180027_quiz_sessions_and_timer.sql"],
  ["028","202611180028_timetable_conflicts.sql"],
  ["029","202611180029_attendance_quiz_database_integrity.sql"],
  ["030","202611180030_ai_request_quota.sql"],
  ["031","202611180031_intervention_followups.sql"],
  ["032","202611180032_college_ai_vault.sql"],
  ["033","202611180033_question_bank.sql"],
  ["034","202611180034_class_gradebook_policies.sql"],
  ["035","202611180035_student_success_rules.sql"],
];
export default async function AcademicHealthPage(){
  await requireRole(["admin"]);
  let db:ReturnType<typeof createAdminClient>;
  try{db=createAdminClient();}
  catch{
    return <><PageHeader title="Academic diagnostics" description="Server-side prerequisites without disclosing credentials."/>
      <section role="alert" className="surface p-5 text-sm">
        The privileged Supabase server connection is unavailable.
        Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project environment variables,
        then redeploy. Never put the service-role key into a NEXT_PUBLIC_ variable.
      </section></>;
  }
  const statuses=await Promise.all(checks.map(async(check)=>{
    const {error}=await db.from(check.table).select(check.columns,{head:true,count:"exact"}).limit(1);
    if(error)academicLog("health."+check.table+"."+check.columns,error);
    return {...check,issue:error?academicIssueFor(error):null,code:error?.code??null};
  }));
  const failed=statuses.filter((s)=>s.issue!==null);
  return <>
    <PageHeader title="Academic diagnostics" description="Database schema and service-access checks for Student Success, Gradebook and Outcomes."/>
    <div className="space-y-5">
      <section className="surface p-5" role="status">
        <div className="flex items-start gap-3">{failed.length?<AlertTriangle size={20} className="text-amber-600"/>:<CheckCircle2 size={20} className="text-[var(--green)]"/>}
          <div><h2 className="text-sm font-semibold">{failed.length?failed.length+" academic checks need attention":"All checked database endpoints are accessible"}</h2>
            <p className="mt-1 text-xs leading-6 text-[var(--muted)]">These are read-only checks using the server's service-role connection. They do not modify student data or prove RLS correctness.</p>
          </div>
        </div>
      </section>
      <section className="surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Database size={17}/>Database readiness</h2>
        <div className="mt-3 table-wrap"><table className="table-base min-w-[560px]"><thead>
          <tr><th>Requirement</th><th>Migration</th><th>Result</th></tr></thead><tbody>
          {statuses.map((check)=><tr key={check.label}>
            <td>{check.label}</td><td>{check.migration}</td>
            <td>{check.issue
              ? <span className="text-amber-700">Needs attention ({check.issue}, {check.code??"unknown"})</span>
              : <span className="text-[var(--green)]">Available</span>}</td>
          </tr>)}
        </tbody></table></div>
      </section>
      <section className="surface p-5">
        <h2 className="text-sm font-semibold">Manual forward SQL patches</h2>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Use your Campus Class Supabase SQL Editor to apply missing patches in filename order. Do not run all patches blindly on an existing production schema. Back up first and confirm dependencies.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{migrations.map(([num,file])=>
          <a key={num} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-[var(--line)] p-3 text-xs hover:bg-[var(--surface-2)]"
             href={"https://github.com/ruizxzx/Campus-Class/blob/main/supabase/migrations/"+file}>
            SQL {num} <ExternalLink size={13}/></a>)}</div>
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">After migration 032, sign in to <Link href="/admin/ai" className="underline">Admin AI Settings</Link> and save the college's OpenRouter API key again. Existing ciphertext cannot be decrypted with a missing original server master key.</p>
        <p className="mt-2 text-xs"><a className="underline" target="_blank" rel="noopener noreferrer"
          href="https://github.com/ruizxzx/Campus-Class/blob/main/docs/CAMPUSCLASS_2_0_COMPLETION.md">Full rollout and acceptance checklist</a></p>
      </section>
    </div>
  </>;
}
