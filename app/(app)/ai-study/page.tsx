import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AIStudyAssistant } from "@/components/ai-study-assistant";

export default async function AIStudyPage() {
  await requireRole(["student"]);
  return <>
    <PageHeader title="AI study assistant" description="A private study space for your own workload and college learning materials."/>
    <AIStudyAssistant/>
  </>;
}
