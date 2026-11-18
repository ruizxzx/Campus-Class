import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamPostSchema } from "@/lib/validators";
import { getAttachmentMimeType, hasExpectedFileSignature } from "@/lib/upload-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "faculty" && context.profile.role !== "admin") {
    return NextResponse.json({ error: "Only faculty or administrators may publish class posts." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "A valid multipart post is required." }, { status: 400 });
  }

  let studentIds: unknown;
  try {
    studentIds = JSON.parse(String(form.get("student_ids") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "The targeted student list is invalid." }, { status: 400 });
  }
  const parsed = streamPostSchema.safeParse({
    class_id: form.get("class_id"),
    title: form.get("title"),
    body: form.get("body"),
    post_type: form.get("post_type"),
    visibility: form.get("visibility"),
    student_ids: studentIds,
    pinned: form.get("pinned") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Review the class post details and recipients." }, { status: 400 });
  }

  const uploaded = form.get("attachment");
  const file = uploaded instanceof File && uploaded.size > 0 ? uploaded : null;
  let bytes: Buffer | null = null;
  let extension = "";
  if (file) {
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ error: "Attachments must be 30 MB or smaller." }, { status: 400 });
    }
    const lastDot = file.name.lastIndexOf(".");
    extension = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : "";
    if (getAttachmentMimeType(extension) !== file.type) {
      return NextResponse.json({ error: "Use a PDF, image, DOCX, or PPTX attachment." }, { status: 400 });
    }
    bytes = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedFileSignature(bytes, extension)) {
      return NextResponse.json({ error: "The attachment contents do not match its file type." }, { status: 400 });
    }
  }

  const db = createAdminClient();
  const { data: classroom, error: classError } = await db.from("classes")
    .select("id")
    .eq("id", parsed.data.class_id)
    .eq("college_id", context.profile.college_id)
    .maybeSingle();
  if (classError) {
    console.error("Unable to validate stream class access", classError);
    return NextResponse.json({ error: "Unable to validate this classroom." }, { status: 500 });
  }
  if (!classroom) {
    return NextResponse.json({ error: "This classroom is unavailable to your account." }, { status: 404 });
  }
  if (context.profile.role === "faculty") {
    const { data: assignment, error: assignmentError } = await db.from("class_faculty")
      .select("faculty_id")
      .eq("college_id", context.profile.college_id)
      .eq("class_id", parsed.data.class_id)
      .eq("faculty_id", context.userId)
      .maybeSingle();
    if (assignmentError) {
      console.error("Unable to verify stream faculty assignment", assignmentError);
      return NextResponse.json({ error: "Could not verify your classroom assignment." }, { status: 500 });
    }
    if (!assignment) {
      return NextResponse.json({ error: "You are not assigned to this classroom." }, { status: 403 });
    }
  }

  if (parsed.data.student_ids.length) {
    const { data: activeEnrollments, error: enrollmentError } = await db.from("class_enrollments")
      .select("student_id")
      .eq("college_id", context.profile.college_id)
      .eq("class_id", parsed.data.class_id)
      .eq("status", "active")
      .in("student_id", parsed.data.student_ids);
    if (enrollmentError) {
      console.error("Unable to verify stream target students", enrollmentError);
      return NextResponse.json({ error: "Could not verify the selected students." }, { status: 500 });
    }
    const activeIds = new Set((activeEnrollments ?? []).map((entry) => entry.student_id));
    if (parsed.data.student_ids.some((studentId) => !activeIds.has(studentId))) {
      return NextResponse.json({ error: "One or more selected students are not active in this classroom." }, { status: 403 });
    }
  }

  const { data: post, error: postError } = await db.from("class_stream_posts").insert({
    college_id: context.profile.college_id,
    class_id: parsed.data.class_id,
    author_id: context.userId,
    title: parsed.data.title,
    body: parsed.data.body,
    post_type: parsed.data.post_type,
    visibility: parsed.data.visibility,
    pinned_at: parsed.data.pinned ? new Date().toISOString() : null,
    published_at: null,
  }).select("id").single();
  if (postError || !post) {
    if (postError) console.error("Unable to create class stream post", postError);
    return NextResponse.json({ error: "Could not create the class post." }, { status: postError?.code === "42501" ? 403 : 500 });
  }
  const postId = post.id;

  let storagePath: string | null = null;
  async function rollBackPost() {
    if (storagePath) {
      const { error } = await db.storage.from("class-stream").remove([storagePath]);
      if (error) console.error("Unable to remove a failed stream attachment upload", error);
    }
    const { error } = await db.from("class_stream_posts").delete().eq("id", postId);
    if (error) console.error("Unable to remove a failed draft stream post", error);
  }

  if (parsed.data.student_ids.length) {
    const { error } = await db.from("stream_targets").insert(parsed.data.student_ids.map((studentId) => ({
      college_id: context.profile.college_id,
      post_id: postId,
      student_id: studentId,
    })));
    if (error) {
      console.error("Unable to set stream post recipients", error);
      await rollBackPost();
      return NextResponse.json({ error: "One or more selected students are not active in this classroom." }, { status: 403 });
    }
  }

  if (file && bytes) {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
    storagePath = `${context.profile.college_id}/${parsed.data.class_id}/${postId}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await db.storage.from("class-stream").upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      console.error("Unable to upload class stream attachment", uploadError);
      await rollBackPost();
      return NextResponse.json({ error: "Could not upload the attachment." }, { status: 500 });
    }

    const { error: attachmentError } = await db.from("stream_attachments").insert({
      college_id: context.profile.college_id,
      post_id: postId,
      file_name: file.name.slice(0, 255),
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
    });
    if (attachmentError) {
      console.error("Unable to record class stream attachment", attachmentError);
      await rollBackPost();
      return NextResponse.json({ error: "Could not save the attachment record." }, { status: 500 });
    }
  }

  const { error: publishError } = await db.from("class_stream_posts")
    .update({ published_at: new Date().toISOString() })
    .eq("id", postId);
  if (publishError) {
    console.error("Unable to publish class stream post", publishError);
    await rollBackPost();
    return NextResponse.json({ error: "Could not publish the class post." }, { status: 500 });
  }

  return NextResponse.json({ id: postId }, { status: 201 });
}
