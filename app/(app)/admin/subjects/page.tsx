import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SubjectManager } from "@/components/admin-managers";
export default async function SubjectsPage(){const profile=await requireRole(["admin"]);return <><PageHeader title="Subjects" description="Build the subject catalogue by department, semester and academic year."/><SubjectManager profile={profile}/></>;}
