import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { CalendarClock, CheckCircle2, CircleAlert } from "lucide-react";
import { format, isPast } from "date-fns";

export default async function TodoPage() {
 const profile=await requireProfile();const db=await createClient();
 const {data:assignments,error}=await db.from("assignments")
  .select("id,title,due_at,classes(display_name,section,subjects(name)),assignment_submissions(id,status,submitted_at)")
  .eq("status","published").eq("assignment_submissions.student_id",profile.id).order("due_at",{ascending:true}).limit(100);
 if(error) console.error("Unable to load tasks", error);
 const rows:any[]=[];
 for(const a of (assignments as any[])??[]) {
  const submission=(a.assignment_submissions??[]).find((s:any)=>s.student_id===profile.id) ?? null;
  if(profile.role==="student") rows.push({id:a.id,title:a.title,due_at:a.due_at,className:a.classes?.display_name,status:submission?"completed":a.due_at&&isPast(new Date(a.due_at))?"missing":"assigned"});
 }
 const groups=[["Assigned","assigned"],["Missing","missing"],["Completed","completed"]] as const;
 return <><PageHeader title="To-do" description="A consolidated view of coursework across your joined classes."/>
 <div className="grid gap-4 md:grid-cols-3">{groups.map(([title,status])=><section key={status} className="surface p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="text-xs text-[var(--muted)]">{rows.filter(r=>r.status===status).length}</span></div><div className="space-y-2">{rows.filter(r=>r.status===status).map(r=><div key={r.id} className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs font-semibold">{r.title}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{r.className??"Class"}{r.due_at?` · ${format(new Date(r.due_at),"dd MMM, h:mm a")}`:""}</div></div>)}{!rows.some(r=>r.status===status)&&<p className="py-4 text-xs text-[var(--muted)]">Nothing here</p>}</div></section>)}</div></>;
}
