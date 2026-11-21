import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FacultyLearningStudio } from "@/components/faculty-learning-studio";

export default async function FacultyLearningPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await requireRole(["faculty", "admin"]);
  const { tab: requestedTab } = await searchParams;
  const initialTab = requestedTab === "course" || requestedTab === "quiz" ? requestedTab : "stream";
  const db = await createClient();
  let classResult;
  if (profile.role === "faculty") {
    const { data: facultyRelations } = await db.from("class_faculty")
      .select("class_id")
      .eq("college_id", profile.college_id)
      .eq("faculty_id", profile.id);
    const classIds = (facultyRelations ?? []).map((relation) => relation.class_id);
    classResult = classIds.length
      ? await db.from("classes").select("id,display_name,section,subjects(id,name,code)").eq("college_id", profile.college_id).eq("is_active",true).in("id", classIds).order("display_name")
      : { data: [], error: null };
  } else {
    classResult = await db.from("classes").select("id,display_name,section,subjects(id,name,code)").eq("college_id", profile.college_id).order("display_name");
  }
  const eligible=[...new Set((classResult.data??[]).flatMap(c=>(Array.isArray(c.subjects)?c.subjects:c.subjects?[c.subjects]:[]).map(x=>x.id)))];
  const subjectQuery=db.from("subjects").select("id,name,code").eq("college_id",profile.college_id).eq("is_active",true).order("name");
  const subjectResult=profile.role==="admin"?await subjectQuery:eligible.length?await subjectQuery.in("id",eligible):{data:[],error:null};
  if (classResult.error) throw new Error("Unable to load assigned classrooms.");
  if (subjectResult.error) throw new Error("Unable to load college subjects.");

  const classRows = classResult.data ?? [];
  const classIds = classRows.map((classroom) => classroom.id);
  const enrollmentResult = classIds.length
    ? await db.from("class_enrollments").select("class_id,student_id").eq("college_id",profile.college_id).in("class_id", classIds).eq("status", "active")
    : { data: [], error: null };
  if (enrollmentResult.error) throw new Error("Unable to load active classroom rosters.");
  const enrollmentRows = enrollmentResult.data ?? [];
  const studentIds = [...new Set(enrollmentRows.map((enrollment) => enrollment.student_id))];
  const studentResult = studentIds.length
    ? await db.from("profiles").select("id,full_name").eq("college_id", profile.college_id).in("id", studentIds).eq("role", "student").eq("status", "active")
    : { data: [], error: null };
  if (studentResult.error) throw new Error("Unable to load active student names.");
  const studentNames = new Map((studentResult.data ?? []).map((student) => [student.id, student.full_name]));
  const classes = classRows.map((classroom) => ({
    ...classroom,
    students: enrollmentRows
      .filter((enrollment) => enrollment.class_id === classroom.id)
      .flatMap((enrollment) => {
        const fullName = studentNames.get(enrollment.student_id);
        return fullName ? [{ id: enrollment.student_id, full_name: fullName }] : [];
      }),
  }));

  return (
    <>
      <PageHeader title="Learning studio" description="Publish class stream updates, courses, lessons and assessments." />
      <FacultyLearningStudio classes={classes} subjects={subjectResult.data ?? []} initialTab={initialTab} />
    </>
  );
}
