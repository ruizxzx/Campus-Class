import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const uuid = z.string().uuid();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), subject_id: uuid, code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(3).max(180), target_percent: z.number().min(0).max(100) }),
  z.object({ action: z.literal("link"), outcome_id: uuid, resource_type: z.enum(["assignment","quiz"]), resource_id: uuid, weight: z.number().positive().max(100) }),
  z.object({ action: z.literal("update"), outcome_id: uuid, title: z.string().trim().min(3).max(180), target_percent: z.number().min(0).max(100) }),
  z.object({ action: z.literal("unlink"), mapping_id: uuid }),
]);
export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  const role = context.profile.role;
  if (role !== "admin" && role !== "faculty") return NextResponse.json({ error: "Faculty access required." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid outcome." }, { status: 400 });
  const data = parsed.data;
  const db = createAdminClient();
  const collegeId = context.profile.college_id;
  let subjectId = data.action === "create" ? data.subject_id : "";
  let resourceClassId: string | null = null;
  let outcomeId = "";
  if (data.action === "unlink") {
    const { data: mapping, error: mappingError } = await db.from("outcome_assessments")
      .select("outcome_id,assignment_id,quiz_id").eq("id", data.mapping_id).eq("college_id", collegeId).maybeSingle();
    if (mappingError || !mapping) return NextResponse.json({ error: "Assessment mapping not found." }, { status: mappingError ? 503 : 404 });
    outcomeId = mapping.outcome_id;
    const resourceType = mapping.assignment_id ? "assignment" : "quiz";
    const resourceId = mapping.assignment_id ?? mapping.quiz_id;
    if (!resourceId) return NextResponse.json({ error: "Mapping has no assessment." }, { status: 409 });
    const { data: resource, error: resourceError } = await db.from(resourceType === "quiz" ? "quizzes" : "assignments")
      .select("class_id").eq("college_id", collegeId).eq("id", resourceId).maybeSingle();
    if (resourceError || !resource) return NextResponse.json({ error: "Mapped assessment is unavailable." }, { status: resourceError ? 503 : 404 });
    resourceClassId = resource.class_id;
  }
  if (data.action === "update" || data.action === "link") outcomeId = data.outcome_id;
  if (outcomeId) {
    const { data: outcome, error } = await db.from("course_outcomes").select("id,subject_id")
      .eq("college_id", collegeId).eq("id", outcomeId).maybeSingle();
    if (error || !outcome) return NextResponse.json({ error: "Outcome could not be loaded." }, { status: error ? 503 : 404 });
    subjectId = outcome.subject_id;
  }
  if (data.action === "link") {
    const table = data.resource_type === "quiz" ? "quizzes" : "assignments";
    const { data: resource, error: resourceError } = await db.from(table).select("id,class_id")
      .eq("college_id", collegeId).eq("id", data.resource_id).maybeSingle();
    if (resourceError || !resource) return NextResponse.json({ error: "Assessment not found." }, { status: resourceError ? 503 : 404 });
    resourceClassId = resource.class_id;
  }
  if (resourceClassId) {
    const { data: resourceClass, error: relationError } = await db.from("classes").select("subject_id")
      .eq("college_id", collegeId).eq("id", resourceClassId).maybeSingle();
    if (relationError || !resourceClass || resourceClass.subject_id !== subjectId) {
      return NextResponse.json({ error: "Assessment must belong to the same subject as the outcome." }, { status: 400 });
    }
  }
  const { data: subject, error: subjectError } = await db.from("subjects").select("id")
    .eq("college_id", collegeId).eq("id", subjectId).eq("is_active", true).maybeSingle();
  if (subjectError || !subject) return NextResponse.json({ error: "Subject not available." }, { status: subjectError ? 503 : 404 });
  if (role === "faculty") {
    const { data: assignments, error } = await db.from("class_faculty").select("class_id")
      .eq("college_id", collegeId).eq("faculty_id", context.userId);
    if (error) return NextResponse.json({ error: "Unable to check faculty permissions." }, { status: 503 });
    const classIds = (assignments ?? []).map((item) => item.class_id);
    if (!classIds.length) return NextResponse.json({ error: "You are not assigned to this subject." }, { status: 403 });
    const { data: classes, error: classError } = await db.from("classes")
      .select("id").eq("college_id", collegeId).eq("subject_id", subjectId).in("id", classIds).limit(100);
    if (classError || !(classes ?? []).length) return NextResponse.json({ error: "You cannot manage this subject." }, { status: classError ? 503 : 403 });
    if (resourceClassId && !(classes ?? []).some((item) => item.id === resourceClassId)) {
      return NextResponse.json({ error: "You are not assigned to the assessment's class." }, { status: 403 });
    }
  }
  if (data.action === "update") {
    const { error } = await db.from("course_outcomes")
      .update({ title: data.title, target_percent: data.target_percent })
      .eq("college_id", collegeId).eq("id", data.outcome_id);
    if (error) return NextResponse.json({ error: "Could not update the outcome." }, { status: 503 });
  } else if (data.action === "unlink") {
    const { error } = await db.from("outcome_assessments").delete()
      .eq("college_id", collegeId).eq("id", data.mapping_id);
    if (error) return NextResponse.json({ error: "Could not unlink the assessment." }, { status: 503 });
  } else if (data.action === "create") {
    const { error } = await db.from("course_outcomes").insert({
      college_id: collegeId, subject_id: subjectId, created_by: context.userId,
      code: data.code.toUpperCase(), title: data.title, target_percent: data.target_percent,
    });
    if (error?.code === "23505") return NextResponse.json({ error: "An outcome with this code already exists for the subject." }, { status: 409 });
    if (error) return NextResponse.json({ error: "Unable to create course outcome. Check the Campus Class 2.0 migration." }, { status: 503 });
  } else {
    const { error } = await db.from("outcome_assessments").insert({
      college_id: collegeId, outcome_id: data.outcome_id,
      assignment_id: data.resource_type === "assignment" ? data.resource_id : null,
      quiz_id: data.resource_type === "quiz" ? data.resource_id : null,
      weight: data.weight,
    });
    if (error?.code === "23505") return NextResponse.json({ error: "This assessment is already mapped to the outcome." }, { status: 409 });
    if (error) return NextResponse.json({ error: "Unable to map this assessment." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
