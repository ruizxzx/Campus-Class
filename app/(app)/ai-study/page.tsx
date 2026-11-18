import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AIStudyAssistant } from "@/components/ai-study-assistant";

export default async function AIStudyPage() {
  await requireRole(["student"]);
  return <>
    <PageHeader title="Campus AI Study Copilot" description="Ask grounded questions, practise concepts and build personalized revision plans with referenced course material."/>
    <AIStudyAssistant/>
  </>;
}
