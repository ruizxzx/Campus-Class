import { EmptyState, PageHeader } from "@/components/ui";
import { ChatRoomList, type ChatRoom } from "@/components/chat-room-list";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { chatRouteIdSchema } from "@/lib/validators";
import { redirect } from "next/navigation";

type RoomRow = {
  id: string;
  display_name: string | null;
  section: string;
  subjects: { name: string; code: string } | null;
};

type SummaryRow = {
  class_id: string;
  last_message_at: string | null;
  last_message: string | null;
  unread_count: number;
};

export default async function ChatIndexPage({ searchParams }: { searchParams: Promise<{ class?: string | string[] }> }) {
  const { class: classId } = await searchParams;
  if (typeof classId === "string" && chatRouteIdSchema.safeParse(classId).success) {
    redirect(`/chat/${classId}`);
  }
  const profile = await requireProfile();
  const db = await createClient();
  const { data: classRows, error: classesError } = await db.from("classes")
    .select("id,display_name,section,subjects(name,code)")
    .eq("college_id", profile.college_id)
    .eq("is_active", true)
    .order("display_name");
  if (classesError) {
    console.error("Unable to load class chat rooms", { code: classesError.code, message: classesError.message });
    return (
      <>
        <PageHeader title="Class chat" description="Every active section has a private group conversation." />
        <EmptyState title="Could not load your class chats" description="Refresh the page and try again." />
      </>
    );
  }
  const classes = (classRows ?? []) as unknown as RoomRow[];

  const [facultyResult, enrollmentResult, summariesResult] = await Promise.all([
    profile.role === "faculty"
      ? db.from("class_faculty").select("class_id").eq("college_id", profile.college_id).eq("faculty_id", profile.id)
      : Promise.resolve({ data: [], error: null }),
    profile.role === "student"
      ? db.from("class_enrollments").select("class_id")
        .eq("college_id", profile.college_id)
        .eq("student_id", profile.id)
        .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    db.rpc("get_my_class_chat_summaries"),
  ]);
  if (facultyResult.error || enrollmentResult.error) {
    console.error("Unable to load class chat memberships", {
      facultyCode: facultyResult.error?.code,
      enrollmentCode: enrollmentResult.error?.code,
    });
    return (
      <>
        <PageHeader title="Class chat" description="Every active section has a private group conversation." />
        <EmptyState title="Could not verify class memberships" description="Refresh the page and try again." />
      </>
    );
  }
  if (summariesResult.error) {
    console.error("Unable to load class chat summaries", { code: summariesResult.error.code, message: summariesResult.error.message });
  }

  const permitted = new Set([
    ...(facultyResult.data ?? []).map((item) => item.class_id),
    ...(enrollmentResult.data ?? []).map((item) => item.class_id),
  ]);
  const summaries = (summariesResult.data ?? []) as unknown as SummaryRow[];
  const summariesByClass = new Map(summaries.map((summary) => [summary.class_id, summary]));
  const visible = (profile.role === "admin" ? classes : classes.filter((room) => permitted.has(room.id)))
    .map((room): ChatRoom => {
      const summary = summariesByClass.get(room.id);
      return {
        id: room.id,
        displayName: room.display_name || `${room.subjects?.code ?? "Class"} · ${room.section}`,
        section: room.section,
        subjectName: room.subjects?.name ?? "Class",
        subjectCode: room.subjects?.code ?? "",
        lastMessage: summary?.last_message ?? null,
        lastMessageAt: summary?.last_message_at ?? null,
        unreadCount: Number(summary?.unread_count ?? 0),
      };
    })
    .sort((a, b) => {
      const aDate = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bDate = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bDate - aDate;
    });

  return (
    <>
      <PageHeader title="Class chat" description="Private group conversations for the active sections you teach or attend." />
      {summariesResult.error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Unread counts and recent previews are temporarily unavailable. You can still open each class chat.
        </div>
      )}
      <ChatRoomList rooms={visible} />
    </>
  );
}
