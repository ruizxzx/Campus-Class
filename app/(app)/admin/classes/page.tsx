import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClassManager } from "@/components/admin-managers";
export default async function ClassesPage(){const profile=await requireRole(["admin"]);return <><PageHeader title="Classes" description="Create class sections, assign faculty and manage student enrollment codes."/><ClassManager profile={profile}/></>;}
