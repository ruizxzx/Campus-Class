import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";

const schema = z.object({ full_name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional().nullable() });
export async function PATCH(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and phone number." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null }).eq("id", context.userId).eq("college_id", context.profile.college_id);
  if (error) return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
  return NextResponse.json({ success: true });
}
