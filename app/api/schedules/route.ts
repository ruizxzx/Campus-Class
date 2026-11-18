import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { classScheduleSchema } from "@/lib/validators";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (!["admin", "faculty"].includes(context.profile.role)) {
    return NextResponse.json({ error: "Only faculty and administrators can create schedules." }, { status: 403 });
  }
  const parsed = classScheduleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid schedule entry." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: classroom } = await admin.from("classes").select("id").eq("id", parsed.data.class_id).eq("college_id", context.profile.college_id).maybeSingle();
  if (!classroom) return NextResponse.json({ error: "The selected class is unavailable." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: assignment } = await admin.from("class_faculty")
      .select("faculty_id")
      .eq("college_id", context.profile.college_id)
      .eq("class_id", parsed.data.class_id)
      .eq("faculty_id", context.userId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
  }
  const { error } = await admin.from("class_schedule_entries").insert({
    college_id: context.profile.college_id,
    class_id: parsed.data.class_id,
    created_by: context.userId,
    weekday: parsed.data.weekday,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    location: parsed.data.location || null,
    notes: parsed.data.notes || null,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A schedule entry already exists at that class and start time." }, { status: 409 });
    if (error.code === "42P01") return NextResponse.json({ error: "The timetable database migration has not been applied. Ask an administrator to apply the latest Supabase migrations." }, { status: 503 });
    console.error("Schedule entry insert failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Could not save the timetable entry." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (!["admin", "faculty"].includes(context.profile.role)) {
    return NextResponse.json({ error: "Only faculty and administrators can delete timetable entries." }, { status: 403 });
  }
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid schedule entry." }, { status: 400 });
  const id = parsed.data.id;
  const admin = createAdminClient();
  const { data: entry } = await admin.from("class_schedule_entries").select("id,class_id").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "Schedule entry not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: assignment } = await admin.from("class_faculty")
      .select("faculty_id")
      .eq("college_id", context.profile.college_id)
      .eq("class_id", entry.class_id)
      .eq("faculty_id", context.userId)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
  }
  const { error } = await admin.from("class_schedule_entries").delete().eq("id", id).eq("college_id", context.profile.college_id);
  if (error) return NextResponse.json({ error: "Could not delete the timetable entry." }, { status: 500 });
  return NextResponse.json({ success: true });
}
