import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { InviteManager } from "@/components/admin-managers";

export default async function StudentsPage() {
  const profile = await requireRole(["admin"]);
  return <>
    <PageHeader title="Students" description="Create student accounts with a temporary password, manage access and reset passwords without email delivery."/>
    <InviteManager profile={profile} role="student"/>
  </>;
}
