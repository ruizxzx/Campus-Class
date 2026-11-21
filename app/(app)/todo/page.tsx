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
 const groups=student?[["Assigned","assigned"],["Missing","missing"],["Completed","completed"]]:[["Upcoming coursework","assigned"],["Past deadlines","missing"]];
 return <><PageHeader title="To-do" description={student?"A consolidated view of coursework across your joined classes.":"Published coursework across your assigned classrooms."}/>
 <div className="grid gap-4 md:grid-cols-3">{groups.map(([title,status])=><section key={status} className="surface p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="text-xs text-[var(--muted)]">{rows.filter(r=>r.status===status).length}</span></div><div className="space-y-2">{rows.filter(r=>r.status===status).map(r=><div key={r.id} className="rounded-xl bg-[var(--surface-2)] p-3"><div className="text-xs font-semibold">{profile.role==="admin"?r.title:<Link href={student?`/assignments/${r.id}`:`/faculty/assignments/${r.id}`}>{r.title}</Link>}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{r.due_at?new Date(r.due_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"No deadline"}</div></div>)}{!rows.some(r=>r.status===status)&&<p className="py-4 text-xs text-[var(--muted)]">Nothing here</p>}</div></section>)}</div></>;
}
