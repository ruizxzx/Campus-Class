import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CollegeAISettings } from "@/components/college-ai-settings";

export default async function AdminAISettingsPage() {
  await requireRole(["admin"]);
  return <>
    <PageHeader title="CampusClass AI" description="Configure the college's private OpenRouter connection and AI availability."/>
    <CollegeAISettings/>
  </>;
}
