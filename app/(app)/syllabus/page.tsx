import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SyllabusManager } from "@/components/academic-planning";

export default async function SyllabusPage() {
  const profile = await requireProfile();
  const db = await createClient();
  let classes: any[] = [];
  if (profile.role === "admin") {
    const { data } = await db.from("classes").select("id,display_name,section,subjects(name,code)").eq("college_id", profile.college_id).eq("is_active", true);
    classes = data ?? [];
  } else if (profile.role === "faculty") {
    const { data: relations } = await db.from("class_faculty").select("class_id").eq("college_id", profile.college_id).eq("faculty_id", profile.id);
    const ids = (relations ?? []).map((item) => item.class_id);
    if (ids.length) {
      const { data } = await db.from("classes").select("id,display_name,section,subjects(name,code)").eq("college_id", profile.college_id).in("id", ids);
      classes = data ?? [];
    }
  } else {
    const { data: enrollments } = await db.from("class_enrollments").select("class_id").eq("college_id", profile.college_id).eq("student_id", profile.id).eq("status", "active");
    const ids = (enrollments ?? []).map((item) => item.class_id);
    if (ids.length) {
      const { data } = await db.from("classes").select("id,display_name,section,subjects(name,code)").eq("college_id", profile.college_id).in("id", ids);
      classes = data ?? [];
    }
  }
  const classIds = classes.map((item) => item.id);
  const { data: syllabi } = classIds.length
    ? await db.from("class_syllabi").select("id,title,file_name,file_size,outline_text,storage_path,class_id").eq("college_id", profile.college_id).in("class_id", classIds).order("created_at", { ascending: false })
    : { data: [] };
  return <>
    <PageHeader title="Syllabi" description="View published course outlines and syllabus PDFs for your classes."/>
    <SyllabusManager classes={classes} syllabi={syllabi ?? []} canManage={profile.role === "admin" || profile.role === "faculty"}/>
  </>;
}
