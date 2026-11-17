import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/settings-forms";
export default async function ProfilePage(){const profile=await requireProfile();return <><PageHeader title="Profile" description="Your account details and college membership."/><ProfileForm profile={profile}/></>;}
