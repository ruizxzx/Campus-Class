import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { CourseEditForm } from "@/components/course-edit-form";
import { notFound } from "next/navigation";
import Link from "next/link";

type Lesson={id:string;title:string;plain_text:string|null;video_url:string|null;
  is_published:boolean;position:number};
type Module={id:string;title:string;description:string|null;position:number;
  course_lessons:Lesson[]|null};
export default async function EditCoursePage({params}:{params:Promise<{courseId:string}>}){
  const profile=await requireRole(["admin","faculty"]);
  const {courseId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(courseId))notFound();
  const db=await createClient();
  const {data:course,error}=await db.from("courses")
    .select("id,college_id,subject_id,title,description,status,updated_at,course_modules(id,title,description,position,course_lessons(id,title,plain_text,video_url,is_published,position))")
    .eq("college_id",profile.college_id).eq("id",courseId).maybeSingle();
  if(error)throw new Error("Could not load editable course.");
  if(!course)notFound();
  if(profile.role==="faculty"){
    const {data:membership,error:membershipError}=await db.from("class_faculty")
      .select("class_id").eq("college_id",profile.college_id).eq("faculty_id",profile.id);
    if(membershipError)throw new Error("Could not verify course edit assignment.");
    const ids=(membership??[]).map((item)=>item.class_id);
    if(!ids.length)notFound();
    const {data:assigned,error:subjectError}=await db.from("classes")
      .select("id").eq("college_id",profile.college_id)
      .eq("subject_id",course.subject_id).eq("is_active",true).in("id",ids).limit(1);
    if(subjectError)throw new Error("Could not verify assigned course subject.");
    if(!assigned?.length)notFound();
  }
  const modules=(course.course_modules??[]) as Module[];
  return <>
    <PageHeader title={"Edit "+course.title} description="Publish lessons, reorder chapters, archive or revise course content without losing saved student progress."/>
    <Link href="/faculty/courses" className="mb-4 inline-block text-xs font-semibold text-[var(--green-strong)] underline">
      Back to managed courses
    </Link>
    <CourseEditForm key={course.updated_at}
      course={{id:course.id,subject_id:course.subject_id,title:course.title,
      description:course.description,status:course.status,updated_at:course.updated_at}}
      modules={modules}/>
  </>;
}
