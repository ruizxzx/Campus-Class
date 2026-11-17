import { AuthCard } from "@/components/auth-card";
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <AuthCard mode="invite" token={token}/>;
}
