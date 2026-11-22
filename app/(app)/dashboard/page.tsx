import { istDate } from "@/lib/display";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, SectionHeading, EmptyState } from "@/components/ui";
import { Users, GraduationCap, BookOpen, School, ClipboardCheck, FileText, Clock3, CalendarDays, ArrowUpRight } from "lucide-react";
import { isPast } from "date-fns";
import { assignmentState, latestSubmissions, awaitingRelease } from "@/lib/assignment-work-state";

function requestTime() { return Date.now(); }

export default async function DashboardPage({searchParams}:{
  searchParams:Promise<{copilot?:string}>;
}) {
  const profile = await requireProfile();
  const copilotNotice=(await searchParams).copilot==="students-only"&&profile.role!=="student"
    ? <p role="alert" className="mb-4 rounded-xl border border-amber-400 p-4 text-sm">
        AI Study Copilot is for students only. {profile.role==="admin"?
          <Link href="/admin/ai" className="font-semibold underline">View AI settings and usage</Link>:
          "Ask your college administrator about AI settings."}
      </p> : null;
  const supabase = await createClient();
  const collegeId = profile.college_id;

  if (profile.role === "admin") {
    const [students, faculty, departments, subjects, classes, assignments, submissions, released, recent] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("role", "student").eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("role", "faculty").eq("status", "active"),
      supabase.from("departments").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("is_active", true),
      supabase.from("subjects").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("is_active", true),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("is_active", true),
      supabase.from("assignments").select("id", { count: "exact", head: true }).eq("college_id", collegeId).eq("status","published"),
      supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("college_id", collegeId),
      supabase.from("assignment_evaluations").select("id", { count: "exact", head: true }).eq("college_id",collegeId).not("released_at","is",null),
      supabase.from("activity_logs").select("id,action,created_at,entity_type").eq("college_id", collegeId).order("created_at", { ascending: false }).limit(6),
    ]);
    return <>{copilotNotice}<PageHeader title={`Good day, ${profile.full_name.split(" ")[0]}.`} description="Here is the current academic pulse of your college workspace." action={<Link href="/admin/classes" className="btn-primary">Manage classes <ArrowUpRight size={14}/></Link>}/>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Active students" value={students.count ?? 0} icon={GraduationCap} note="Enrolled college accounts"/><StatCard label="Faculty members" value={faculty.count ?? 0} icon={Users} note="Active teaching staff"/><StatCard label="Departments" value={departments.count ?? 0} icon={School} note="Academic departments"/><StatCard label="Subjects" value={subjects.count ?? 0} icon={BookOpen} note={`${classes.count ?? 0} active classes`} tone="orange"/></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_.8fr]"><section className="surface p-5 sm:p-6"><SectionHeading title="Recent academic activity"/><div className="mt-3">{recent.data?.length ? recent.data.map((item) => <div key={item.id} className="flex items-center gap-3 border-t border-[var(--line)] py-3 first:border-0"><div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><ClipboardCheck size={15}/></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.action.replaceAll(".", " ")}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{istDate(item.created_at,{"day":"2-digit","month":"short","year":"numeric","hour":"numeric","minute":"2-digit","hour12":true})}</div></div></div>) : <EmptyState title="No activity yet" description="New academic actions will appear here as your college starts using CampusClass."/>}</div></section><section className="surface p-5 sm:p-6"><SectionHeading title="At a glance"/><div className="mt-2 space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><FileText size={15}/>Assignments published</div><div className="text-lg font-semibold">{assignments.count ?? 0}</div></div><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Clock3 size={15}/>Pending evaluations</div><div className="text-lg font-semibold">{awaitingRelease(submissions.count ?? 0,released.count ?? 0)}</div></div><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><School size={15}/>Active class sections</div><div className="text-lg font-semibold">{classes.count ?? 0}</div></div></div><div className="mt-6 rounded-2xl bg-[var(--green-soft)] p-4"><div className="text-xs font-semibold text-[var(--green-strong)]">Next step</div><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Invite faculty and students, then set up your academic departments and classes.</p><Link href="/admin/faculty" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--green-strong)]">Invite faculty <ArrowUpRight size={13}/></Link></div></section></div>
    </>;
  }

  if (profile.role === "faculty") {
    const {data: memberships,error: membershipError}=await supabase.from("class_faculty").select("class_id").eq("college_id",collegeId).eq("faculty_id",profile.id);
    if(membershipError)throw new Error("Could not load assigned classes.");
    const classIds=(memberships??[]).map(row=>row.class_id);
    const classCount=classIds.length;
    const [assignmentResult,submissionResult]=classIds.length ? await Promise.all([
      supabase.from("assignments").select("id,title,status,due_at,created_at,classes(display_name,section,subjects(name,code))",{count:"exact"}).eq("college_id",collegeId).in("class_id",classIds).eq("work_type","assignment").order("created_at",{ascending:false}).limit(8),
      supabase.from("assignment_submissions").select("id,assignments!inner(class_id)",{count:"exact",head:true}).eq("college_id",collegeId).in("assignments.class_id",classIds).in("status",["submitted","late"]),
    ]) : [{data:[],count:0,error:null},{count:0,error:null}];
    if(assignmentResult.error||submissionResult.error)throw new Error("Could not load faculty work.");
    const assignments=assignmentResult.data??[];
    const assignmentCount=assignmentResult.count;
    const submissionCount=submissionResult.count;
    return <>{copilotNotice}<PageHeader title={`Welcome, ${profile.full_name.split(" ")[0]}.`} description="Your classes, assignments and student work in one place." action={<Link href="/faculty/assignments/new" className="btn-primary">Create assignment <FileText size={14}/></Link>}/><div className="grid gap-4 sm:grid-cols-3"><StatCard label="Assigned classes" value={classCount ?? 0} icon={School}/><StatCard label="My assignments" value={assignmentCount ?? 0} icon={FileText}/><StatCard label="Pending submissions" value={submissionCount ?? 0} icon={ClipboardCheck} tone="orange"/></div><section className="surface mt-5 p-5 sm:p-6"><SectionHeading title="Recent assignments" href="/faculty/assignments"/><div className="table-wrap"><table className="table-base"><thead><tr><th>Assignment</th><th>Class</th><th>Due date</th><th>Status</th></tr></thead><tbody>{assignments.length ? assignments.map((a: any) => <tr key={a.id}><td><Link href={`/faculty/assignments/${a.id}`} className="font-semibold hover:text-[var(--green)]">{a.title}</Link></td><td>{a.classes?.subjects?.name ?? "Class"} · {a.classes?.section ?? "—"}</td><td>{a.due_at ? istDate(a.due_at,{"day":"2-digit","month":"short","year":"numeric"}) : "No deadline"}</td><td><span className={`status-pill ${a.status === "published" ? "green" : ""}`}>{a.status}</span></td></tr>) : <tr><td colSpan={4} className="py-8"><EmptyState title="No assignments yet" description="Create your first assignment for one of your assigned classes." action={<Link href="/faculty/assignments/new" className="btn-secondary">Create assignment</Link>}/></td></tr>}</tbody></table></div></section></>;
  }

  const [enrollments, assignments, submissions, announcements] = await Promise.all([
    supabase.from("class_enrollments").select("id,class_id,classes(id,section,display_name,subjects(name,code))").eq("college_id", collegeId).eq("student_id", profile.id).eq("status", "active"),
    supabase.from("assignments").select("id,title,due_at,status,class_id,classes(subjects(name,code),section)").eq("college_id", collegeId).eq("status", "published").eq("work_type","assignment").order("due_at", { ascending: true }).limit(1000),
    supabase.from("assignment_submissions").select("id,assignment_id,status,submitted_at,version").eq("college_id", collegeId).eq("student_id", profile.id),
    supabase.from("announcements").select("id,title,body,published_at").eq("college_id", collegeId).order("published_at", { ascending: false }).limit(4),
  ]);
  const joined = enrollments.data ?? [];
  const myClassIds = new Set(joined.map((e: any) => e.class_id));
  const myAssignments = (assignments.data ?? []).filter((a: any) => myClassIds.has(a.class_id));
  const visibleIds=new Set(myAssignments.map(a=>a.id));
  const submitted = latestSubmissions((submissions.data ?? []).filter(row=>visibleIds.has(row.assignment_id)));
  const mySubmissions=[...submitted.values()];
  const now=requestTime();
  const overdue = myAssignments.filter(a=>assignmentState(a,submitted,now)==="missing");
  const pending = myAssignments.filter(a=>assignmentState(a,submitted,now)==="assigned");
  const evaluatedCount = mySubmissions.filter((s: any) => s.status === "evaluated").length;
  const workList = [...overdue, ...pending].sort((a: any, b: any) => (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER)).slice(0, 8);
  return <><PageHeader title={`Hello, ${profile.full_name.split(" ")[0]}.`} description="Your learning dashboard, with the next deadline always in view." action={<Link href="/join" className="btn-primary">Join a class <ArrowUpRight size={14}/></Link>}/><div className="grid gap-4 sm:grid-cols-3 2xl:grid-cols-5"><StatCard label="My classes" value={joined.length} icon={School}/><StatCard label="Pending work" value={pending.length} icon={Clock3} tone="orange"/><StatCard label="Overdue" value={overdue.length} icon={CalendarDays} tone="orange"/><StatCard label="Submitted" value={mySubmissions.length} icon={ClipboardCheck}/><StatCard label="Evaluated" value={evaluatedCount} icon={GraduationCap}/></div><div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><section className="surface p-5 sm:p-6"><SectionHeading title="Assignment deadlines" href="/assignments"/><div className="space-y-2">{workList.length ? workList.map((a: any) => {const isOverdue=Boolean(a.due_at&&isPast(new Date(a.due_at)));return <Link href={`/assignments/${a.id}`} key={a.id} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] p-4 transition-colors hover:bg-[var(--surface-2)]"><div className={`grid h-9 w-9 place-items-center rounded-xl ${isOverdue?"bg-orange-100 text-orange-700":"bg-[var(--green-soft)] text-[var(--green)]"}`}><FileText size={16}/></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{a.title}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{a.classes?.subjects?.name ?? "Class"} · {a.classes?.section ?? ""}</div></div><div className="shrink-0 text-right"><div className="text-[10px] font-semibold">{a.due_at ? istDate(a.due_at,{"day":"2-digit","month":"short"}) : "No due date"}</div><div className={`mt-1 text-[9px] ${isOverdue?"text-orange-700":"text-[var(--muted)]"}`}>{isOverdue?"Overdue":"Deadline"}</div></div></Link>;}) : <EmptyState title="You're up to date" description="Join a class or check back when faculty publish new assignments." icon="file"/>}</div></section><section className="surface p-5 sm:p-6"><SectionHeading title="My classes" href="/classes"/><div className="space-y-2">{joined.length ? joined.slice(0,5).map((e: any) => <Link key={e.id} href={`/classes/${e.class_id}`} className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]"><BookOpen size={15}/></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{e.classes?.subjects?.name ?? "Class"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">Section {e.classes?.section ?? "—"}</div></div></Link>) : <EmptyState title="No classes yet" description="Use a class enrollment code from your faculty to get started." action={<Link href="/join" className="btn-secondary">Join a class</Link>}/>}</div><div className="mt-5 border-t border-[var(--line)] pt-4"><div className="mb-3 text-xs font-semibold">Recent announcements</div>{announcements.data?.length ? announcements.data.map((a) => <div key={a.id} className="mb-3"><div className="text-xs font-semibold">{a.title}</div><div className="mt-1 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{a.body}</div></div>) : <p className="text-[11px] text-[var(--muted)]">No announcements to show.</p>}</div></section></div></>;
}
