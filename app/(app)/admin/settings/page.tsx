import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { CollegeSettingsForm } from "@/components/settings-forms";
export default async function AdminSettingsPage(){const profile=await requireRole(["admin"]);const supabase=await createClient();const {data:college}=await supabase.from("colleges").select("id,name,email,phone,timezone").eq("id",profile.college_id).single();return <><PageHeader title="College settings" description="Manage the institution details associated with this workspace."/><CollegeSettingsForm profile={profile} college={college}/></>;}
