import {AIUsageReport} from "@/components/ai-usage-report";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CollegeAISettings } from "@/components/college-ai-settings";

export default async function AdminAISettingsPage() {
  const profile=await requireRole(["admin"]);
  return <>
    <PageHeader title="CampusClass AI" description="Configure the college's private OpenRouter connection and AI availability."/>
    <CollegeAISettings/><AIUsageReport collegeId={profile.college_id}/>
  </>;
}
