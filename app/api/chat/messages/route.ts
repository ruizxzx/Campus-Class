import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatMessageSchema } from "@/lib/validators";
import { getAttachmentMimeType, hasExpectedFileSignature } from "@/lib/upload-validation";

export const runtime = "nodejs";

const maxAttachmentBytes = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "A valid chat message is required." }, { status: 400 });
  }

  const selectedFile = form.get("attachment");
  const file = selectedFile instanceof File && selectedFile.name ? selectedFile : null;
  const submittedBody = String(form.get("body") ?? "");
  const parsed = chatMessageSchema.safeParse({
    class_id: form.get("class_id"),
    body: submittedBody.trim() || (file ? "Shared an attachment." : ""),
    parent_id: form.get("parent_id") || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Review the message and try again." }, { status: 400 });
  }

  let fileBytes: Buffer | null = null;
  let extension = "";
  if (file) {
    if (file.size < 1 || file.size > maxAttachmentBytes) {
      return NextResponse.json({ error: "Chat attachments must be 20 MB or smaller." }, { status: 400 });
    }
    const lastDot = file.name.lastIndexOf(".");
    extension = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : "";
    if (getAttachmentMimeType(extension) !== file.type) {
      return NextResponse.json({ error: "Use a PDF, image, DOCX, or PPTX attachment." }, { status: 400 });
    }
    try {
      fileBytes = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "Could not read the selected attachment." }, { status: 400 });
    }
    if (!hasExpectedFileSignature(fileBytes, extension)) {
      return NextResponse.json({ error: "The attachment contents do not match its file type." }, { status: 400 });
    }
  }

  const db = await createClient();
  const { data: classroom, error: classError } = await db.from("classes")
    .select("id")
    .eq("id", parsed.data.class_id)
    .eq("college_id", context.profile.college_id)
    .eq("is_active", true)
    .maybeSingle();
  if (classError) {
    console.error("Unable to validate class chat access", { code: classError.code, message: classError.message });
    return NextResponse.json({ error: "Unable to validate this classroom." }, { status: 500 });
  }
  if (!classroom) {
    return NextResponse.json({ error: "This classroom is unavailable to your account." }, { status: 404 });
  }

  if (context.profile.role !== "admin") {
    const membership = context.profile.role === "faculty"
      ? await db.from("class_faculty").select("class_id")
        .eq("college_id", context.profile.college_id)
        .eq("class_id", parsed.data.class_id)
        .eq("faculty_id", context.userId)
        .maybeSingle()
      : await db.from("class_enrollments").select("class_id")
        .eq("college_id", context.profile.college_id)
        .eq("class_id", parsed.data.class_id)
        .eq("student_id", context.userId)
        .eq("status", "active")
        .maybeSingle();
    if (membership.error) {
      console.error("Unable to validate class chat membership", {
        code: membership.error.code,
        message: membership.error.message,
      });
      return NextResponse.json({ error: "Unable to validate classroom membership." }, { status: 500 });
    }
    if (!membership.data) {
      return NextResponse.json({ error: "You are not a member of this class chat." }, { status: 403 });
    }
  }

  if (parsed.data.parent_id) {
    const { data: parent, error: parentError } = await db.from("class_messages")
      .select("id")
      .eq("id", parsed.data.parent_id)
      .eq("class_id", parsed.data.class_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (parentError) {
      console.error("Unable to validate chat reply", { code: parentError.code, message: parentError.message });
      return NextResponse.json({ error: "Unable to validate this reply." }, { status: 500 });
    }
    if (!parent) return NextResponse.json({ error: "The message you are replying to is unavailable." }, { status: 404 });
  }

  const messageId = randomUUID();
  const safeName = file?.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) ?? null;
  const storagePath = file && safeName
    ? `${context.profile.college_id}/${parsed.data.class_id}/${messageId}/${randomUUID()}-${safeName}`
    : null;
  const messageData = {
    id: messageId,
    college_id: context.profile.college_id,
    class_id: parsed.data.class_id,
    sender_id: context.userId,
    body: parsed.data.body,
    parent_id: parsed.data.parent_id,
    attachment_path: storagePath,
    attachment_name: safeName,
    attachment_mime: file?.type ?? null,
    attachment_size: file?.size ?? null,
    attachment_ready: !file,
  };
  const admin = createAdminClient();
  if (file && (!fileBytes || !storagePath)) {
    return NextResponse.json({ error: "Could not initialize the secure attachment upload." }, { status: 500 });
  }
  const { data: createdMessage, error: insertError } = await admin.from("class_messages")
    .insert(messageData)
    .select("id,body,sender_id,created_at,edited_at,parent_id,pinned_at,attachment_name")
    .single();
  if (insertError) {
    console.error("Unable to create class chat message", { code: insertError.code, message: insertError.message });
    return NextResponse.json(
      { error: insertError.code === "42501" ? "You cannot post in this class chat." : "Could not send this message." },
      { status: insertError.code === "42501" ? 403 : 500 },
    );
  }

  if (file && fileBytes && storagePath) {
    const { error: uploadError } = await admin.storage.from("class-chat").upload(storagePath, fileBytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      console.error("Unable to upload class chat attachment", { message: uploadError.message });
      const { error: deleteError } = await admin.from("class_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (deleteError) console.error("Unable to hide a failed chat message", { message: deleteError.message });
      return NextResponse.json({ error: "Could not upload the attachment." }, { status: 500 });
    }

    const { error: readyError } = await admin.from("class_messages")
      .update({ attachment_ready: true })
      .eq("id", messageId);
    if (readyError) {
      console.error("Unable to publish uploaded class chat attachment", { message: readyError.message });
      const { error: removeError } = await admin.storage.from("class-chat").remove([storagePath]);
      if (removeError) console.error("Unable to clean up an incomplete chat attachment", { message: removeError.message });
      const { error: deleteError } = await admin.from("class_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (deleteError) console.error("Unable to hide a failed chat message", { message: deleteError.message });
      return NextResponse.json({ error: "Could not finish saving the attachment." }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: {
      ...createdMessage,
      deleted_at: null,
      profiles: { full_name: context.profile.full_name },
    },
  }, { status: 201 });
}
