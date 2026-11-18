import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";

export default async function FacultyCoursesPage() {
  const profile=await requireRole(["admin","faculty"]);
  const db=await createClient();
  let subjects:string[]|null=null;
  if(profile.role==="faculty"){
    const {data:membership,error:membershipError}=await db.from("class_faculty")
      .select("class_id").eq("college_id",profile.college_id).eq("faculty_id",profile.id);
    if(membershipError)throw new Error("Could not verify faculty classes.");
    const ids=(membership??[]).map((item)=>item.class_id);
    if(!ids.length)subjects=[];
    else{
      const {data:classes,error}=await db.from("classes").select("subject_id")
        .eq("college_id",profile.college_id).eq("is_active",true).in("id",ids);
      if(error)throw new Error("Could not verify faculty subjects.");
      subjects=[...new Set((classes??[]).map((item)=>item.subject_id))];
    }
  }
  const {data:courses,error}=subjects?.length===0
    ?{data:[],error:null}:await (subjects
      ?db.from("courses").select("id,subject_id,title,status,updated_at,subjects(name,code)")
        .eq("college_id",profile.college_id).in("subject_id",subjects)
        .order("updated_at",{ascending:false}).limit(300)
      :db.from("courses").select("id,subject_id,title,status,updated_at,subjects(name,code)")
        .eq("college_id",profile.college_id).order("updated_at",{ascending:false}).limit(300));
  if(error)throw new Error("Could not load managed course catalog.");
  return <>
    <PageHeader title="Manage courses" description="Edit draft/published course materials, organize lectures and preserve learning history."/>
    <div className="mb-4 flex flex-wrap gap-3">
      <Link href="/faculty/learning?tab=course" className="btn-primary"><BookOpen size={15}/>Create course</Link>
      <Link href="/courses" className="btn-secondary">Course library</Link>
    </div>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {(courses??[]).map((course)=>{
        const subject=Array.isArray(course.subjects)?course.subjects[0]:course.subjects;
        return <Link href={"/faculty/courses/"+course.id+"/edit"} key={course.id}
          className="surface group min-w-0 p-5 transition-colors hover:border-[var(--green)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
              {subject?.code??"Course"}
            </span>
            <span className={"status-pill "+(course.status==="active"?"green":"")}>
              {course.status==="active"?"Published":"Draft / archived"}
            </span>
          </div>
          <h2 className="mt-4 text-sm font-semibold">{course.title}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{subject?.name??"College subject"}</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--green-strong)]">
            <PenLine size={14}/>Edit curriculum
          </div>
        </Link>;
      })}
      {!courses?.length&&<p className="surface col-span-full p-6 text-sm text-[var(--muted)]">
        No course drafts or published courses are assigned to you yet.
      </p>}
    </section>
    {(courses?.length??0)>=300&&<p role="alert" className="mt-4 text-xs text-[var(--muted)]">
      Showing the first 300 managed courses. Contact your administrator for large-catalog management.
    </p>}
  </>;
}
