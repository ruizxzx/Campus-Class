import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { chatRouteIdSchema } from "@/lib/validators";

type RouteContext = { params: Promise<{ messageId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  const { messageId } = await params;
  if (!chatRouteIdSchema.safeParse(messageId).success) {
    return NextResponse.json({ error: "A valid message ID is required." }, { status: 400 });
  }
  const db = await createClient();
  const { data: message, error } = await db.from("class_messages")
    .select("attachment_path,attachment_name,attachment_ready")
    .eq("id", messageId)
    .eq("college_id", context.profile.college_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("Unable to validate class chat attachment", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Unable to open this attachment." }, { status: 500 });
  }
  if (!message?.attachment_path || !message.attachment_ready) {
    return NextResponse.json({ error: "This attachment is unavailable." }, { status: 404 });
  }

  const { data, error: signingError } = await db.storage.from("class-chat")
    .createSignedUrl(message.attachment_path, 60, { download: message.attachment_name ?? true });
  if (signingError || !data?.signedUrl) {
    console.error("Unable to sign class chat attachment", { message: signingError?.message });
    return NextResponse.json({ error: "You cannot access this attachment." }, { status: 403 });
  }
  return NextResponse.redirect(data.signedUrl);
}
