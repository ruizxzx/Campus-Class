import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { chatReactionSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  const body = await request.json().catch(() => null);
  const parsed = chatReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a valid reaction." }, { status: 400 });
  }

  const db = await createClient();
  const { data, error } = await db.rpc("toggle_class_message_reaction", {
    _message_id: parsed.data.message_id,
    _reaction: parsed.data.reaction,
  });
  if (error) {
    console.error("Unable to update class chat reaction", { code: error.code, message: error.message });
    return NextResponse.json(
      { error: error.code === "42501" ? "You cannot react to this message." : "Could not update this reaction." },
      { status: error.code === "42501" ? 403 : 500 },
    );
  }
  return NextResponse.json({ active: data });
}
