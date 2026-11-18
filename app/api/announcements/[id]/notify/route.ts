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
  const { data: announcement, error: announcementError } = await admin.from("announcements").select("id,college_id,class_id,title,author_id").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (announcementError) {
    console.error("Announcement notification lookup failed", { code: announcementError.code });
    return NextResponse.json({ error: "Could not verify the announcement." }, { status: 500 });
  }
  if (!announcement) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  if (context.profile.role === "faculty") {
    const { data: access, error: accessError } = await admin.from("class_faculty").select("class_id").eq("college_id", announcement.college_id).eq("class_id", announcement.class_id).eq("faculty_id", context.userId).maybeSingle();
    if (accessError) return NextResponse.json({ error: "Could not verify announcement permissions." }, { status: 500 });
    if (!access || announcement.author_id !== context.userId) return NextResponse.json({ error: "You cannot notify this class about another faculty member's announcement." }, { status: 403 });
  }
  const { data: roster, error: rosterError } = await admin.from("class_enrollments").select("student_id").eq("college_id", announcement.college_id).eq("class_id", announcement.class_id).eq("status", "active");
  if (rosterError) return NextResponse.json({ error: "Could not load the class roster." }, { status: 500 });
  let notified = 0;
  if (roster?.length) {
    const { data, error } = await admin.from("notifications").upsert(roster.map((item) => ({ college_id: announcement.college_id, user_id: item.student_id, type: "announcement.published", title: "New class announcement", body: announcement.title, href: "/announcements", reference_key: `announcement-published:${announcement.id}:${item.student_id}` })), { onConflict: "user_id,reference_key", ignoreDuplicates: true }).select("id");
    if (error) return NextResponse.json({ error: "Announcement published, but notifications could not be sent." }, { status: 500 });
    notified = data?.length ?? 0;
  }
  return NextResponse.json({ success: true, notified });
}
