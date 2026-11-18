import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AIStudyAssistant } from "@/components/ai-study-assistant";
import { createClient } from "@/lib/supabase/server";

export default async function AIStudyPage() {
  const profile = await requireRole(["student"]);
  const db = await createClient();
  const { data: memberships, error: membershipError } = await db.from("class_enrollments")
    .select("class_id").eq("college_id", profile.college_id).eq("student_id",profile.id).eq("status","active");
  if (membershipError) throw new Error("Cannot load study class membership.");
  const classIds=(memberships??[]).map((item)=>item.class_id);
  const { data: syllabi, error: syllabusError }=classIds.length
    ? await db.from("class_syllabi").select("id,title,class_id").eq("college_id",profile.college_id)
        .in("class_id",classIds).order("created_at",{ascending:false}).limit(100)
    : {data:[],error:null};
  if(syllabusError) throw new Error("Cannot load accessible syllabi.");
  const { data: personalNotes, error: notesError }=await db.from("personal_notes")
    .select("id,title").eq("college_id",profile.college_id).eq("user_id",profile.id)
    .order("updated_at",{ascending:false}).limit(100);
  if(notesError)throw new Error("Cannot load personal note choices.");
  return <>
    <PageHeader title="Campus AI Study Copilot" description="Ask grounded questions, practise concepts and build personalized revision plans with referenced course material."/>
    <AIStudyAssistant syllabi={syllabi??[]} notes={personalNotes??[]}/>
  </>;
}
