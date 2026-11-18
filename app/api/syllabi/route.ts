import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { syllabusUploadSchema } from "@/lib/validators";
import { hasExpectedFileSignature } from "@/lib/upload-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requestProfile();
    if (isResponse(context)) return context;
    if (!["admin", "faculty"].includes(context.profile.role)) {
      return NextResponse.json({ error: "Only faculty and administrators can upload syllabi." }, { status: 403 });
    }

    const form = await request.formData();
    const classId = String(form.get("class_id") ?? "");
    const title = String(form.get("title") ?? "");
    const outlineText = String(form.get("outline_text") ?? "");
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a PDF syllabus file." }, { status: 400 });
    }
    const parsed = syllabusUploadSchema.safeParse({ title, outline_text: outlineText });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid syllabus." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(classId)) {
      return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
    }
    const safeFileName = file.name.toLowerCase();
    if (!safeFileName.endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "The syllabus must be a PDF file." }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf" && file.type !== "application/x-pdf") {
      return NextResponse.json({ error: "The selected file is not recognized as a PDF." }, { status: 400 });
    }
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "The syllabus must be between 1 byte and 20 MB." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedFileSignature(bytes, ".pdf")) {
      return NextResponse.json({ error: "The selected file is not a valid PDF document." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: classroom, error: classError } = await admin.from("classes")
      .select("id")
      .eq("id", classId)
      .eq("college_id", context.profile.college_id)
      .maybeSingle();
    if (classError || !classroom) {
      return NextResponse.json({ error: "The selected class is unavailable." }, { status: 404 });
    }
    if (context.profile.role === "faculty") {
      const { data: permission } = await admin.from("class_faculty")
        .select("faculty_id")
        .eq("college_id", context.profile.college_id)
        .eq("class_id", classId)
        .eq("faculty_id", context.userId)
        .maybeSingle();
      if (!permission) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
    }

    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
    const storagePath = `${context.profile.college_id}/${classId}/${id}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("class-syllabi").upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      console.error("Syllabus upload failed", { code: uploadError.status, message: uploadError.message });
      if (/bucket/i.test(uploadError.message) || uploadError.status === 404) {
        return NextResponse.json({ error: "The syllabus Storage bucket is missing. Apply the latest Supabase migrations." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not upload the syllabus file.", code: uploadError.status ?? null }, { status: 500 });
    }
    const { error: insertError } = await admin.from("class_syllabi").insert({
      id,
      college_id: context.profile.college_id,
      class_id: classId,
      created_by: context.userId,
      title: parsed.data.title,
      file_name: file.name.slice(0, 255),
      storage_path: storagePath,
      file_size: file.size,
      outline_text: parsed.data.outline_text,
    });
    if (insertError) {
      await admin.storage.from("class-syllabi").remove([storagePath]);
      console.error("Syllabus metadata insert failed", { code: insertError.code, message: insertError.message });
      if (insertError.code === "42P01") {
        return NextResponse.json({ error: "The syllabus table is missing. Apply the latest Supabase migrations." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not save the syllabus.", code: insertError.code }, { status: 500 });
    }
    await admin.from("activity_logs").insert({
      college_id: context.profile.college_id,
      actor_id: context.userId,
      action: "class.syllabus.uploaded",
      entity_type: "class_syllabi",
      entity_id: id,
    });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Unexpected syllabus upload failure", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "The syllabus could not be uploaded because the server configuration is unavailable." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (!["admin", "faculty"].includes(context.profile.role)) {
    return NextResponse.json({ error: "Only faculty and administrators can delete syllabi." }, { status: 403 });
  }
  const parsed = await request.json().catch(() => null) as { id?: unknown };
  const id = typeof parsed?.id === "string" ? parsed.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid syllabus." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: syllabus } = await admin.from("class_syllabi")
    .select("id,class_id,storage_path")
    .eq("id", id)
    .eq("college_id", context.profile.college_id)
    .maybeSingle();
  if (!syllabus) return NextResponse.json({ error: "Syllabus not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: permission } = await admin.from("class_faculty")
      .select("faculty_id")
      .eq("college_id", context.profile.college_id)
      .eq("class_id", syllabus.class_id)
      .eq("faculty_id", context.userId)
      .maybeSingle();
    if (!permission) return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
  }
  await admin.storage.from("class-syllabi").remove([syllabus.storage_path]);
  const { error } = await admin.from("class_syllabi").delete().eq("id", id).eq("college_id", context.profile.college_id);
  if (error) return NextResponse.json({ error: "Could not delete the syllabus." }, { status: 500 });
  return NextResponse.json({ success: true });
}
