import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
const schema = z.object({ status: z.enum(["active", "inactive"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Only college administrators can change member status." }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid member status." }, { status: 400 });
  const admin = createAdminClient();
  const { data: member } = await admin.from("profiles").select("id,role,status").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (!member || member.role === "admin") return NextResponse.json({ error: "This member cannot be changed from this screen." }, { status: 404 });
  const { error } = await admin.from("profiles").update({ status: parsed.data.status }).eq("id", id).eq("college_id", context.profile.college_id);
  if (error) return NextResponse.json({ error: "Could not update member status." }, { status: 500 });
  await admin.from("activity_logs").insert({ college_id: context.profile.college_id, actor_id: context.userId, action: `member.${parsed.data.status}`, entity_type: "profile", entity_id: id });
  return NextResponse.json({ success: true });
}
