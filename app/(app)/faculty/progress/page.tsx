import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, EmptyState } from "@/components/ui";
import { CourseApprovalButton } from "@/components/course-approval-button";
export const dynamic = "force-dynamic";
export default async function FacultyProgress({searchParams}:{
  searchParams:Promise<{course?:string}>;
}) {
  const profile=await requireRole(["faculty","admin"]);
  const db=createAdminClient();
  const params=await searchParams;
  const {data:classRows,error:classError}=await db.from("classes")
    .select("id,subject_id").eq("college_id",profile.college_id).eq("is_active",true);
  if(classError)throw new Error("Could not load classrooms.");
  let allowed=classRows??[];
  if(profile.role==="faculty"){
    const {data:assignments,error}=await db.from("class_faculty")
      .select("class_id").eq("college_id",profile.college_id).eq("faculty_id",profile.id);
    if(error)throw new Error("Could not check faculty classroom assignments.");
    const ids=new Set((assignments??[]).map(item=>item.class_id));
    allowed=allowed.filter(cls=>ids.has(cls.id));
  }
  const subjectIds=[...new Set(allowed.map(cls=>cls.subject_id))];
  const {data:courses,error:courseError}=subjectIds.length
    ?await db.from("courses").select("id,title,subject_id").eq("college_id",profile.college_id)
      .eq("status","active").in("subject_id",subjectIds).order("title")
    :{data:[],error:null};
  if(courseError)throw new Error("Could not load accessible courses.");
  const selected=(courses??[]).find(c=>c.id===params.course)??courses?.[0];
  type ReportRow={id:string;full_name:string;email:string;done:number;total:number;completedLessonIds:string[];
    started:boolean;watchedPercent:number;lastActivity:string|null;hasCertificate:boolean;approved:boolean};
  const rows:ReportRow[]=[];let total=0;
  const lessons:{id:string;title:string}[]=[];
  let approvalRequired=false;
  const started=new Map<string,{sum:number;count:number;last:string|null}>();
  const certificates=new Set<string>();
  const approvals=new Set<string>();
  if(selected) {
    const ids=allowed.filter(cls=>cls.subject_id===selected.subject_id).map(cls=>cls.id);
    const enrolled=new Set<string>();
    for(let start=0;;start+=200){
      const {data,error}=await db.from("class_enrollments").select("student_id")
        .eq("college_id",profile.college_id).eq("status","active")
        .in("class_id",ids).order("student_id").range(start,start+199);
      if(error)throw new Error("Could not load active enrollments.");
      for(const item of data??[])enrolled.add(item.student_id);
      if((data?.length??0)<200)break;
    }
    const {data:modules,error:moduleError}=await db.from("course_modules")
      .select("id").eq("college_id",profile.college_id).eq("course_id",selected.id);
    if(moduleError)throw new Error("Could not load course chapters.");
    const moduleIds=(modules??[]).map(item=>item.id);

    if(moduleIds.length)for(let start=0;;start+=200){
      const {data,error}=await db.from("course_lessons").select("id,title")
        .eq("college_id",profile.college_id).eq("is_published",true)
        .in("module_id",moduleIds).order("id").range(start,start+199);
      if(error)throw new Error("Could not load published lessons.");
      for(const item of data??[])lessons.push({id:item.id,title:item.title});
      if((data?.length??0)<200)break;
    }
    total=lessons.length;
    const completedByStudent=new Map<string,Set<string>>();
    if(lessons.length)for(let start=0;;start+=200){
      const {data,error}=await db.from("lesson_progress").select("student_id,lesson_id")
        .eq("college_id",profile.college_id).in("lesson_id",lessons.map(item=>item.id))
        .order("student_id").order("lesson_id").range(start,start+199);
      if(error)throw new Error("Could not load completion records. Apply SQL 040.");
      for(const item of data??[])if(enrolled.has(item.student_id)){
        const done=completedByStudent.get(item.student_id)??new Set<string>();
        done.add(item.lesson_id);completedByStudent.set(item.student_id,done);
      }
      if((data?.length??0)<200)break;
    }
    const {data:rule,error:ruleError}=await db.from("youtube_course_requirements")
      .select("faculty_approval_required").eq("college_id",profile.college_id)
      .eq("course_id",selected.id).maybeSingle();
    if(ruleError&&ruleError.code!=="PGRST205")throw new Error("Could not read course completion rules.");
    approvalRequired=Boolean(rule?.faculty_approval_required);
    for(let start=0;;start+=200){
      const {data,error}=await db.from("youtube_watch_progress")
        .select("student_id,percent,last_activity_at").eq("college_id",profile.college_id)
        .eq("course_id",selected.id).order("student_id").order("lesson_id")
        .range(start,start+199);
      if(error&&error.code!=="PGRST205")throw new Error("Could not read student playback progress.");
      for(const item of data??[]){
        if(!enrolled.has(item.student_id))continue;
        const previous=started.get(item.student_id)??{sum:0,count:0,last:null};
        started.set(item.student_id,{
          sum:previous.sum+Number(item.percent),count:previous.count+1,
          last:!previous.last||item.last_activity_at>previous.last?item.last_activity_at:previous.last,
        });
      }
      if((data?.length??0)<200)break;
    }
    const {data:issued,error:certError}=await db.from("academic_certificates")
      .select("student_id").eq("college_id",profile.college_id)
      .eq("course_id",selected.id).is("revoked_at",null);
    if(certError)throw new Error("Could not check issued course certificates.");
    for(const c of issued??[])certificates.add(c.student_id);
    if(approvalRequired){
      const {data:approved,error:approvalError}=await db.from("youtube_course_approvals")
        .select("student_id").eq("college_id",profile.college_id)
        .eq("course_id",selected.id);
      if(approvalError)throw new Error("Could not read faculty approvals.");
      for(const a of approved??[])approvals.add(a.student_id);
    }
    const students=[...enrolled];
    for(let start=0;start<students.length;start+=150){
      const {data,error}=await db.from("profiles").select("id,full_name,email")
        .eq("college_id",profile.college_id).eq("role","student")
        .in("id",students.slice(start,start+150));
      if(error)throw new Error("Could not load student profiles.");
      rows.push(...(data??[]).map(p=>({
        ...p,completedLessonIds:[...(completedByStudent.get(p.id)??new Set<string>())],
        done:completedByStudent.get(p.id)?.size??0,total,
        started:started.has(p.id)||(completedByStudent.get(p.id)?.size??0)>0,
        watchedPercent:started.get(p.id)?.count?Math.round(started.get(p.id)!.sum/started.get(p.id)!.count):0,
        lastActivity:started.get(p.id)?.last??null,
        hasCertificate:certificates.has(p.id),
        approved:approvals.has(p.id),
      })));
    }
    rows.sort((a,b)=>a.full_name.localeCompare(b.full_name));
  }
  return <>
    <PageHeader title="Faculty course progress" description="Track which students have completed every published lecture in your assigned subject classes."/>
    <section className="surface mb-5 p-4">
      <p className="text-xs text-[var(--muted)] mb-3">Choose a course</p>
      <div className="flex flex-wrap gap-2">{(courses??[]).map(c=><Link key={c.id}
        href={"/faculty/progress?course="+c.id}
        className={selected?.id===c.id?"btn-primary":"btn-secondary"}>{c.title}</Link>)}</div>
    </section>
    {selected?<section className="surface overflow-hidden">
      <div className="border-b border-[var(--line)] p-5"><h2 className="font-semibold">{selected.title}</h2>
        <p className="text-xs text-[var(--muted)] mt-2">{rows.length} enrolled students · {total} published lessons</p></div>
      <div className="overflow-x-auto"><table className="table-base min-w-[600px] w-full">
        <thead><tr><th>Student</th><th>Completed</th><th>Progress</th><th>Status</th><th>Watch</th><th>Last activity</th><th>Certificate</th>{approvalRequired?<th>Faculty approval</th>:null}
          {lessons.map((lesson,i)=><th key={lesson.id} title={lesson.title} className="whitespace-nowrap">Lecture {i+1}</th>)}
        </tr></thead>
        <tbody>{rows.map(p=><tr key={p.id}>
          <td><div className="font-semibold text-xs">{p.full_name}</div><div className="text-[10px] text-[var(--muted)]">{p.email}</div></td>
          <td>{p.done}/{p.total}</td>
          <td><div role="progressbar" aria-label={"Progress of "+p.full_name} aria-valuenow={total?Math.round(p.done/total*100):0}
            aria-valuemin={0} aria-valuemax={100} className="h-2 min-w-28 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div className="h-full bg-[var(--green-strong)]" style={{width:(total?Math.round(p.done/total*100):0)+"%"}}/></div></td>
          <td>{total&&p.done===total?"Completed":p.started?"In progress":"Not started"}</td>
          <td>{p.watchedPercent}% average</td>
          <td>{p.lastActivity?new Date(p.lastActivity).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"—"}</td>
          <td>{p.hasCertificate?"Issued":"Pending"}</td>
          {approvalRequired?<td>{p.approved?"Approved":p.done===total&&total>0?
            <CourseApprovalButton courseId={selected.id} studentId={p.id}/>:"Waiting for lessons"}</td>:null}
          {lessons.map(lesson=><td key={lesson.id} title={lesson.title} className="text-center font-semibold">{p.completedLessonIds.includes(lesson.id)?"✓":"—"}</td>)}
        </tr>)}</tbody>
      </table></div>
      {!rows.length?<div className="p-5"><EmptyState title="No students enrolled" description="Assigned students will appear after joining their course's class."/></div>:null}
    </section>:<EmptyState title="No assigned courses" description="Create an active course for a class you teach."/>}
  </>;
}
