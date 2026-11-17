import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { DepartmentManager } from "@/components/admin-managers";
export default async function DepartmentsPage(){const profile=await requireRole(["admin"]);return <><PageHeader title="Departments" description="Create and maintain your college's academic departments."/><DepartmentManager profile={profile}/></>;}
