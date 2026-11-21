import { istDate } from "@/lib/display";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { assignmentState, latestSubmissions } from "@/lib/assignment-work-state";

function requestTime() { return Date.now(); }

export default async function TodoPage() {
 const profile=await requireProfile();const db=await createClient();
 const student=profile.role==="student";
 const membership=student
  ? await db.from("class_enrollments").select("class_id").eq("college_id",profile.college_id).eq("student_id",profile.id).eq("status","active")
  : profile.role==="faculty"
    ? await db.from("class_faculty").select("class_id").eq("college_id",profile.college_id).eq("faculty_id",profile.id)
    : await db.from("classes").select("id").eq("college_id",profile.college_id);
 if(membership.error) throw new Error("Unable to load your classes.");
 const ids=(membership.data??[]).map(row=>"class_id" in row?row.class_id:row.id);
 const [assignments,submissions]=await Promise.all([
  ids.length?db.from("assignments").select("id,title,due_at,classes(display_name,section,subjects(name))").eq("college_id",profile.college_id).eq("status","published").eq("work_type","assignment").in("class_id",ids).order("due_at",{ascending:true}):Promise.resolve({data:[],error:null}),
  student?db.from("assignment_submissions").select("assignment_id,status,version").eq("college_id",profile.college_id).eq("student_id",profile.id):Promise.resolve({data:[],error:null})
 ]);
 if(assignments.error||submissions.error)throw new Error("Unable to load tasks.");
 const submitted=latestSubmissions(submissions.data??[]);
 const now=requestTime();
 const rows=(assignments.data??[]).map(a=>({id:a.id,title:a.title,due_at:a.due_at,status:student?assignmentState(a,submitted,now):assignmentState(a,new Map(),now)}));
 const [quizzes,grading]=!student&&ids.length?await Promise.all([db.from("quizzes").select("id,title,closes_at").eq("college_id",profile.college_id).eq("status","published").in("class_id",ids).order("closes_at"),db.from("assignment_submissions").select("id,assignment_id,assignments!inner(class_id,title)").eq("college_id",profile.college_id).in("assignments.class_id",ids).in("status",["submitted","late"]).order("submitted_at",{ascending:false})]):[{data:[],error:null},{data:[],error:null}];
 if(quizzes.error||grading.error)throw new Error("Unable to load assessment and grading queues.");
 const groups=student?[["Assigned","assigned"],["Missing","missing"],["Completed","completed"]]:[["Upcoming coursework","assigned"],["Past deadlines","missing"]];
 return <><PageHeader title="To-do" description={student?"A consolidated view of coursework across your joined classes.":"Published coursework across your assigned classrooms."}/>
 <div className="grid gap-4 md:grid-cols-3">{groups.map(([title,status])=><section key={status} className="surface p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="text-xs text-[var(--muted)]">{rows.filter(r=>r.status===status).length}</span></div><div className="space-y-2">{rows.filter(r=>r.status===status).map(r=><div key={r.id} className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs font-semibold">{profile.role==="admin"?r.title:<Link href={student?`/assignments/${r.id}`:`/faculty/assignments/${r.id}`}>{r.title}</Link>}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{r.due_at?istDate(r.due_at):"No deadline"}</div></div>)}{!rows.some(r=>r.status===status)&&<p className="py-4 text-xs text-[var(--muted)]">Nothing here</p>}</div></section>)}</div>{!student&&<div className="mt-4 grid gap-4 md:grid-cols-2"><section className="surface p-4"><h2 className="text-sm font-semibold">Assessments ({quizzes.data?.length??0})</h2>{(quizzes.data??[]).map(q=><Link key={q.id} href={"/quizzes/"+q.id} className="block py-2 border-b border-[var(--line)] text-xs">{q.title} · {q.closes_at?istDate(q.closes_at):"No deadline"}</Link>)}{!quizzes.data?.length&&<p className="py-4 text-xs text-[var(--muted)]">No published assessments.</p>}</section><section className="surface p-4"><h2 className="text-sm font-semibold">Submissions awaiting evaluation ({grading.data?.length??0})</h2>{profile.role==="faculty"&&<Link href="/faculty/submissions" className="btn-secondary mt-3">Open grading queue</Link>}{(grading.data??[]).map(s=><div key={s.id} className="py-2 border-b border-[var(--line)] text-xs">{(Array.isArray(s.assignments)?s.assignments[0]:s.assignments)?.title??"Assignment"}</div>)}{!grading.data?.length&&<p className="py-4 text-xs text-[var(--muted)]">No pending submissions.</p>}</section></div>}</>;
}
