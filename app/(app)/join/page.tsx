import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JoinClassForm } from "@/components/academic-workflows";
export default async function JoinPage(){await requireRole(["student"]);return <><PageHeader title="Join a class" description="Use the unique enrollment code shared by your faculty or college administrator."/><JoinClassForm/></>;}
