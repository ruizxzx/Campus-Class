import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptInviteSchema } from "@/lib/validators";

export const runtime = "nodejs";

async function findInvitation(admin: ReturnType<typeof createAdminClient>, token?: string, email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const now = new Date().toISOString();

  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await admin.from("college_invitations").select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (!normalizedEmail) return null;

  const { data, error } = await admin.from("college_invitations").select("*").ilike("email", normalizedEmail).is("accepted_at", null).gt("expires_at", now).order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function POST(request: Request) {
  const parsed = acceptInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Provide a valid invitation token or invited email and password." }, { status: 400 });
  }

  const admin = createAdminClient();
  const targetedEmail = parsed.data.email?.trim().toLowerCase();
  const invitation = await findInvitation(admin, parsed.data.token, targetedEmail);
  if (!invitation) return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 404 });
  if (invitation.accepted_at || new Date(invitation.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "This invitation is no longer active." }, { status: 410 });

  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const signedInEmail = user?.email?.trim().toLowerCase();

  if (signedInEmail && signedInEmail !== invitation.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "Sign in using the email address this invitation was sent to." }, { status: 403 });
  }

  let activeUserId = user?.id;
  const resolvedEmail = signedInEmail || targetedEmail || invitation.email.trim().toLowerCase();
  const resolvedFullName = parsed.data.full_name || invitation.full_name || resolvedEmail.split("@")[0];

  if (!user && parsed.data.email && parsed.data.password) {
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: resolvedEmail,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: resolvedFullName, signup_kind: "invitation" },
    });

    if (createError) {
      if (createError.message.toLowerCase().includes("already registered") || createError.message.toLowerCase().includes("already exists")) {
        const { data: existingAuthUser, error: lookupError } = await admin.auth.admin.listUsers();
        if (lookupError) throw lookupError;
        const existingMatch = existingAuthUser.users.find((candidate) => candidate.email?.toLowerCase() === resolvedEmail);
        if (!existingMatch) throw createError;
        activeUserId = existingMatch.id;
      } else {
        throw createError;
      }
    } else {
      activeUserId = createdUser.user.id;
    }
  }

  if (!activeUserId || !resolvedEmail) {
    return NextResponse.json({ error: "Sign in or create an account with the invited email before accepting this invitation." }, { status: 401 });
  }

  const { data: existing } = await admin.from("profiles").select("id,college_id,role,status").eq("id", activeUserId).maybeSingle();
  if (existing && existing.college_id !== invitation.college_id) return NextResponse.json({ error: "This account is already linked to another college workspace." }, { status: 409 });
  if (existing && existing.status === "active") return NextResponse.json({ error: "This account is already active in a college workspace." }, { status: 409 });

  const { error: profileError } = await admin.from("profiles").upsert({
    id: activeUserId,
    college_id: invitation.college_id,
    role: invitation.role,
    full_name: invitation.full_name || resolvedFullName || resolvedEmail.split("@")[0],
    email: resolvedEmail.toLowerCase(),
    status: "active",
  }, { onConflict: "id" });
  if (profileError) return NextResponse.json({ error: "Could not activate this account." }, { status: 500 });

  const { error: acceptedError } = await admin.from("college_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id).is("accepted_at", null);
  if (acceptedError) return NextResponse.json({ error: "Account activated, but invitation finalization failed. Contact your college administrator." }, { status: 500 });
  await admin.from("activity_logs").insert({ college_id: invitation.college_id, actor_id: activeUserId, action: "invitation.accepted", entity_type: "profile", entity_id: activeUserId, details: { role: invitation.role } });
  return NextResponse.json({ success: true, redirectTo: "/dashboard" });
}
