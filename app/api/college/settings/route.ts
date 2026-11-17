import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(2).max(140), email: z.string().trim().email().max(254).optional().or(z.literal("")), phone: z.string().trim().max(30).optional() });
export async function PATCH(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Only administrators can update college settings." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid college details." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("colleges").update({ name: parsed.data.name, email: parsed.data.email || null, phone: parsed.data.phone || null }).eq("id", context.profile.college_id);
  if (error) return NextResponse.json({ error: "Could not update college settings." }, { status: 500 });
  return NextResponse.json({ success: true });
}
