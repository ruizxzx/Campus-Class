import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FacultyLearningStudio } from "@/components/faculty-learning-studio";

export default async function FacultyLearningPage() {
  const profile = await requireRole(["faculty", "admin"]);
  const db = await createClient();
  const [{ data: classes }, { data: subjects }] = await Promise.all([
    db.from("classes").select("id,display_name,section,subjects(id,name,code)").eq("college_id", profile.college_id).order("display_name"),
    db.from("subjects").select("id,name,code").eq("college_id", profile.college_id).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Learning studio" description="Publish class stream updates, courses, lessons and assessments." />
      <FacultyLearningStudio classes={classes ?? []} subjects={subjects ?? []} />
    </>
  );
}
