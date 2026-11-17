import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";

export const runtime = "nodejs";

const passwordSchema = z.object({ password: z.string().min(8).max(128) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "admin") {
    return NextResponse.json({ error: "Only college administrators can reset member passwords." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });

  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("id", id)
    .eq("college_id", context.profile.college_id)
    .in("role", ["faculty", "student"])
    .maybeSingle();
  if (memberError) return NextResponse.json({ error: "Could not verify this member." }, { status: 500 });
  if (!member) return NextResponse.json({ error: "This member cannot be changed from this screen." }, { status: 404 });

  const { error: authError } = await admin.auth.admin.updateUserById(id, { password: parsed.data.password });
  if (authError) return NextResponse.json({ error: "Could not reset the member password." }, { status: 500 });

  const { error: activityError } = await admin.from("activity_logs").insert({
    college_id: context.profile.college_id,
    actor_id: context.userId,
    action: "member.password_reset",
    entity_type: "profile",
    entity_id: id,
    details: { role: member.role },
  });

  return NextResponse.json({
    success: true,
    warning: activityError ? "Password reset succeeded, but its activity log could not be saved." : undefined,
  });
}
