import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { AssignmentComposer } from "@/components/academic-workflows";
export default async function NewAssignmentPage(){const profile=await requireRole(["faculty"]);const supabase=await createClient();const {data:relations}=await supabase.from("class_faculty").select("class_id").eq("college_id",profile.college_id).eq("faculty_id",profile.id).eq("can_manage_assignments",true);const ids=(relations??[]).map(r=>r.class_id);const {data:classes}=ids.length?await supabase.from("classes").select("id,section,academic_year,subjects(name,code)").in("id",ids).eq("is_active",true):{data:[] as any[]};return <><PageHeader title="Create assignment" description="Publish a task for one of your assigned classrooms, or save it as a draft."/><AssignmentComposer profile={profile} classes={classes??[]}/></>;}
