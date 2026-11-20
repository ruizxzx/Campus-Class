import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { inviteSchema } from "@/lib/validators";
import type { z } from "zod";

export type MemberInput = z.infer<typeof inviteSchema>;
export type ProvisionResult = { status: "created" | "existing" | "failed"; reason?: string; userId?: string; warning?: string };

// Shared by the single-member endpoint and the durable bulk worker.
export async function provisionMember(
  admin: ReturnType<typeof createAdminClient>,
  collegeId: string,
  actorId: string,
  input: MemberInput,
  synthetic = false,
): Promise<ProvisionResult> {
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, signup_kind: "admin_created_member", demonstration_account: synthetic },
  });
  if (authError) {
    if (authError.status === 422 || authError.code === "email_exists") return { status: "existing", reason: "Email already registered." };
    console.error("Member Auth creation failed", { status: authError.status, code: authError.code });
    if (authError.status === 429 || (authError.status != null && authError.status >= 500)) return { status: "failed", reason: "Temporary server error." };
    return { status: "failed", reason: "Authentication provider rejected account creation." };
  }
  if (!authData.user) return { status: "failed", reason: "Auth account was not returned; verify manually before retrying." };
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id, college_id: collegeId, role: input.role,
    full_name: input.full_name, email: input.email, status: "active",
  });
  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authData.user.id);
    if (cleanupError) {
      console.error("Member cleanup failed", { code: cleanupError.code, status: cleanupError.status });
      return { status: "failed", reason: "Profile failed and Auth cleanup failed; contact support before retrying." };
    }
    console.error("Member profile insert failed", { code: profileError.code });
    return { status: "failed", reason: profileError.code === "42501" ? "Profile permission denied; apply migrations." : "Profile creation failed; Auth account removed." };
  }
  const { error: auditError } = await admin.from("activity_logs").insert({
    college_id: collegeId, actor_id: actorId, action: "member.created",
    entity_type: "profile", entity_id: authData.user.id,
    details: { role: input.role, synthetic },
  });
  if (auditError) console.error("Member activity audit failed", { code: auditError.code });
  let emailSent = false;
  let warning = auditError ? "Account created, but the activity record failed." : undefined;
  if (input.send_setup_email && !synthetic) {
    try {
      const redirectTo = new URL("/auth/callback?next=/reset-password", process.env.NEXT_PUBLIC_APP_URL ?? "https://campus-class.vercel.app").toString();
      const { error } = await admin.auth.resetPasswordForEmail(input.email, { redirectTo });
      if (error) warning = [warning, "Account created; setup email could not be sent."].filter(Boolean).join(" ");
      else emailSent = true;
    } catch { warning = [warning, "Account created; setup email URL is invalid."].filter(Boolean).join(" "); }
  }
  return { status: "created", userId: authData.user.id, warning: [warning, emailSent ? "Password setup email requested." : ""].filter(Boolean).join(" ") || undefined };
}
