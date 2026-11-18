import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { chatMessageIdSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  const body = await request.json().catch(() => null);
  const parsed = chatMessageIdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a valid message." }, { status: 400 });
  }

  const db = await createClient();
  const { data, error } = await db.rpc("toggle_class_message_pin", { _message_id: parsed.data.message_id });
  if (error) {
    console.error("Unable to update class chat pin", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: error.code === "42501" ? "Only class staff can pin messages." : "Could not update this pin." },
      { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500 },
    );
  }
  return NextResponse.json({ pinned: data });
}
