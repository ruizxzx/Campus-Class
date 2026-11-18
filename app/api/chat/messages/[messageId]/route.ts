import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatRouteIdSchema, editChatMessageSchema } from "@/lib/validators";

type RouteContext = { params: Promise<{ messageId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  const { messageId } = await params;
  if (!chatRouteIdSchema.safeParse(messageId).success) {
    return NextResponse.json({ error: "A valid message ID is required." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = editChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid message." }, { status: 400 });
  }

  const db = await createClient();
  const { data: message, error: lookupError } = await db.from("class_messages")
    .select("id,sender_id")
    .eq("id", messageId)
    .eq("college_id", context.profile.college_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("Unable to validate chat message edit", { code: lookupError.code, message: lookupError.message });
    return NextResponse.json({ error: "Unable to edit this message." }, { status: 500 });
  }
  if (!message) return NextResponse.json({ error: "This message is unavailable." }, { status: 404 });
  if (message.sender_id !== context.userId) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }

  const { data: updatedMessage, error } = await db.from("class_messages")
    .update({ body: parsed.data.body })
    .eq("id", messageId)
    .eq("college_id", context.profile.college_id)
    .eq("sender_id", context.userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Unable to edit class chat message", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Could not update this message." }, { status: error.code === "42501" ? 403 : 500 });
  }
  if (!updatedMessage) return NextResponse.json({ error: "This message is no longer available." }, { status: 409 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  const { messageId } = await params;
  if (!chatRouteIdSchema.safeParse(messageId).success) {
    return NextResponse.json({ error: "A valid message ID is required." }, { status: 400 });
  }
  const db = await createClient();
  const { data: message, error: lookupError } = await db.from("class_messages")
    .select("id,class_id,sender_id,attachment_path")
    .eq("id", messageId)
    .eq("college_id", context.profile.college_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("Unable to validate chat message deletion", { code: lookupError.code, message: lookupError.message });
    return NextResponse.json({ error: "Unable to delete this message." }, { status: 500 });
  }
  if (!message) return NextResponse.json({ error: "This message is unavailable." }, { status: 404 });

  if (message.sender_id !== context.userId) {
    if (context.profile.role === "student") {
      return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
    }
    if (context.profile.role === "faculty") {
      const { data: assignment, error: assignmentError } = await db.from("class_faculty")
        .select("class_id")
        .eq("college_id", context.profile.college_id)
        .eq("class_id", message.class_id)
        .eq("faculty_id", context.userId)
        .maybeSingle();
      if (assignmentError) {
        console.error("Unable to validate class chat moderation", { code: assignmentError.code, message: assignmentError.message });
        return NextResponse.json({ error: "Unable to validate moderation access." }, { status: 500 });
      }
      if (!assignment) return NextResponse.json({ error: "You cannot moderate this class chat." }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const { data: deletedMessage, error } = await admin.from("class_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("college_id", context.profile.college_id)
    .eq("class_id", message.class_id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Unable to delete class chat message", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Could not delete this message." }, { status: error.code === "42501" ? 403 : 500 });
  }
  if (!deletedMessage) {
    return NextResponse.json({ error: "This message has already changed." }, { status: 409 });
  }
  if (message.attachment_path) {
    const { error: cleanupError } = await admin.storage.from("class-chat").remove([message.attachment_path]);
    if (cleanupError) {
      console.error("Unable to clean up deleted chat attachment", { message: cleanupError.message });
      return NextResponse.json({ success: true, cleanup_pending: true });
    }
  }
  return NextResponse.json({ success: true, cleanup_pending: false });
}
