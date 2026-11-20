import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
import { inviteSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "admin") {
    return NextResponse.json({ error: "Only college administrators can create member accounts." }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid account details." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, signup_kind: "admin_created_member" },
  });
  if (authError) {
    if (authError.status === 422 || authError.code === "email_exists") {
      return NextResponse.json({ error: "This email is already registered. Use the existing account or reset its password." }, { status: 409 });
    }
    console.error("Member Auth account creation failed.", { status: authError.status, code: authError.code, message: authError.message });
    return NextResponse.json({ error: "Could not create the sign-in account." }, { status: 500 });
  }
  if (!authData.user) return NextResponse.json({ error: "Supabase did not return the created account." }, { status: 500 });

  const { error: insertProfileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    college_id: context.profile.college_id,
    role: parsed.data.role,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    status: "active",
  });
  if (insertProfileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authData.user.id);
    if (cleanupError) {
      console.error(
        `Failed to remove Auth account after profile creation failed: ${cleanupError.message}`,
      );
      return NextResponse.json({
        error: "The sign-in account was created, but its profile failed and automatic account cleanup also failed. Contact support before retrying.",
      }, { status: 500 });
    }
    console.error(
      `Member profile creation failed (${insertProfileError.code}): ${insertProfileError.message}; details: ${insertProfileError.details ?? "none"}; hint: ${insertProfileError.hint ?? "none"}`,
    );
    const error = insertProfileError.code === "42501"
      ? "The database denied profile creation. Apply the latest Supabase migrations, then try again."
      : "Could not create the member profile. The sign-in account was removed; please try again.";
    return NextResponse.json({ error }, { status: 500 });
  }

  const { error: activityError } = await admin.from("activity_logs").insert({
    college_id: context.profile.college_id,
    actor_id: context.userId,
    action: "member.created",
    entity_type: "profile",
    entity_id: authData.user.id,
    details: { role: parsed.data.role },
  });
  if (activityError) {
    console.error(`Member activity log creation failed (${activityError.code}): ${activityError.message}`);
  }

  // Supabase Auth sends a recovery link so the member chooses their own password.
  // Creation remains successful if SMTP is unavailable; manual credentials work.
  let emailSent = false;
  let setupEmailWarning: string | undefined;
  if (parsed.data.send_setup_email) {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://campus-class.vercel.app";
      const redirectTo = new URL("/auth/callback?next=/reset-password", base).toString();
      const { error: emailError } = await admin.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
      if (emailError) {
        console.error("Member setup email failed", {status:emailError.status,code:emailError.code});
        setupEmailWarning = "Account created, but setup email delivery failed. Share the temporary password securely.";
      } else emailSent = true;
    } catch {
      setupEmailWarning = "Account created, but setup email configuration is invalid. Share the temporary password securely.";
    }
  }
  return NextResponse.json({
    success: true,
    message: emailSent
      ? "Account created. A password-setup email was requested. Share the temporary password only if needed."
      : "Account created. Share the temporary password securely and ask the member to change it in Settings.",
    email_sent: emailSent,
    warning: [activityError?"The account was created, but its activity log could not be saved.":undefined, setupEmailWarning].filter(Boolean).join(" ") || undefined,
  }, { status: 201 });
}
