import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const lesson = z.object({ title: z.string().trim().min(1).max(300),
  content: z.string().max(50000), video: z.string().trim().max(2000) });
const schema = z.object({
  subjectId: z.string().uuid(), title: z.string().trim().min(1).max(300),
  description: z.string().max(20000),
  chapters: z.array(z.object({ title: z.string().trim().min(1).max(300),
    lessons: z.array(lesson).min(1).max(100) })).min(1).max(100),
});

export async function POST(request: Request) {
  const actor = await requestProfile();
  if (isResponse(actor)) return actor;
  if (actor.profile.role !== "faculty" && actor.profile.role !== "admin") {
    return NextResponse.json({ error: "Only faculty or administrators may publish courses." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the title, subject, chapters and lectures. " + (parsed.error.issues[0]?.message ?? "") }, { status: 400 });
  const body = parsed.data;
  const db = createAdminClient();
  const { data, error } = await db.rpc("publish_manual_course", {
    p_college_id: actor.profile.college_id, p_actor_id: actor.userId,
    p_subject_id: body.subjectId, p_title: body.title,
    p_description: body.description, p_chapters: body.chapters,
  });
  if (error || !data) {
    console.error("Manual course publish failed", { code: error?.code });
    const status = error?.code === "42501" ? 403 : error?.code === "22023" ? 400 : 503;
    const message = error?.code === "PGRST202"
      ? "Course publishing requires the new atomic course publication SQL patch (052)."
      : status === 403 ? "Course publication was denied. Check your assigned subject and database permissions."
      : status === 400 ? error?.message : "Course publication failed. Your draft is preserved. Reference: " + (error?.code ?? "unknown");
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ course_id: data }, { status: 201 });
}
