import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role === "student") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: announcement } = await admin.from("announcements").select("id,college_id,class_id,title,author_id").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (!announcement) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: access } = await admin.from("class_faculty").select("class_id").eq("class_id", announcement.class_id).eq("faculty_id", context.userId).maybeSingle();
    if (!access || announcement.author_id !== context.userId) return NextResponse.json({ error: "You cannot notify this class about another faculty member's announcement." }, { status: 403 });
  }
  const { data: roster } = await admin.from("class_enrollments").select("student_id").eq("college_id", announcement.college_id).eq("class_id", announcement.class_id).eq("status", "active");
  if (roster?.length) {
    const { error } = await admin.from("notifications").insert(roster.map((item) => ({ college_id: announcement.college_id, user_id: item.student_id, type: "announcement.published", title: "New class announcement", body: announcement.title, href: "/announcements" })));
    if (error) return NextResponse.json({ error: "Announcement published, but notifications could not be sent." }, { status: 500 });
  }
  return NextResponse.json({ success: true, notified: roster?.length ?? 0 });
}
