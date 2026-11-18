import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { ClassChatRoom, type ChatMessage } from "@/components/class-chat-room";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Room = {
  id: string;
  subject_id: string;
  section: string;
  display_name: string | null;
  subjects: { name: string; code: string } | null;
};

type MessageReaction = { message_id: string; user_id: string; reaction: "👍" | "❤️" | "🎉" | "😄" | "👀" };

export default async function ClassChatPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const profile = await requireProfile();
  const db = await createClient();
  const { data: roomData, error: roomError } = await db.from("classes")
    .select("id,subject_id,section,display_name,subjects(name,code)")
    .eq("id", classId)
    .eq("college_id", profile.college_id)
    .eq("is_active", true)
    .maybeSingle();
  if (roomError) {
    console.error("Unable to load class chat room", { code: roomError.code, message: roomError.message });
  }
  const room = roomData as unknown as Room | null;
  if (roomError || !room) {
    return <EmptyState title="Class not found" description="This active classroom is unavailable to your account." />;
  }

  let isMember = profile.role === "admin";
  if (profile.role === "faculty") {
    const { data: faculty, error } = await db.from("class_faculty").select("class_id")
      .eq("college_id", profile.college_id)
      .eq("class_id", classId)
      .eq("faculty_id", profile.id)
      .maybeSingle();
    if (error) {
      console.error("Unable to verify faculty class chat membership", { code: error.code, message: error.message });
      return <EmptyState title="Could not verify access" description="Refresh the page and try again." />;
    }
    isMember = Boolean(faculty);
  } else if (profile.role === "student") {
    const { data: enrollment, error } = await db.from("class_enrollments").select("id")
      .eq("college_id", profile.college_id)
      .eq("class_id", classId)
      .eq("student_id", profile.id)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("Unable to verify student class chat membership", { code: error.code, message: error.message });
      return <EmptyState title="Could not verify access" description="Refresh the page and try again." />;
    }
    isMember = Boolean(enrollment);
  }
  if (!isMember) {
    return <EmptyState title="Access denied" description="Only active class members can join this section chat." />;
  }

  const { data: messageRows, error: messageError } = await db.from("class_messages")
    .select("id,body,sender_id,created_at,edited_at,deleted_at,parent_id,pinned_at,attachment_name,profiles!class_messages_college_id_sender_id_fkey(full_name)")
    .eq("college_id", profile.college_id)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (messageError) {
    console.error("Unable to load class chat messages", { code: messageError.code, message: messageError.message });
  }
  const initialMessages = ((messageRows ?? []) as unknown as ChatMessage[]).reverse();
  const { data: reactionRows, error: reactionError } = initialMessages.length
    ? await db.from("class_message_reactions")
      .select("message_id,user_id,reaction")
      .eq("class_id", classId)
      .in("message_id", initialMessages.map((message) => message.id))
    : { data: [], error: null };
  if (reactionError) {
    console.error("Unable to load class chat reactions", { code: reactionError.code, message: reactionError.message });
  }

  const listHref = profile.role === "faculty" ? "/faculty/classes" : profile.role === "admin" ? "/admin/classes" : "/classes";
  const classLabel = room.display_name || `${room.subjects?.code ?? "Class"} · ${room.section}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--muted)]">
          <Link href={listHref} className="hover:text-[var(--text)]">My Classes</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span>{classLabel}</span>
        </div>
        <Link href="/chat" className="btn-secondary !py-2 text-xs">All class chats</Link>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Classroom navigation">
        {[
          { label: "Stream", href: `/stream?class=${classId}` },
          { label: "Classwork", href: profile.role === "faculty" ? `/faculty/assignments?class=${classId}` : `/assignments?class=${classId}` },
          { label: "Courses", href: `/courses?subject=${room.subject_id}` },
          { label: "Resources", href: `/stream?class=${classId}&type=material` },
          { label: "Chat", href: `/chat/${classId}`, active: true },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={`btn-secondary shrink-0 !px-3 !py-2 text-xs ${item.active ? "!border-[var(--green)] !bg-[var(--green-soft)]" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {messageError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Messages could not be loaded. Sending and realtime updates may still be available.
        </div>
      )}

      <ClassChatRoom
        key={classId}
        classId={classId}
        collegeId={profile.college_id}
        className={classLabel}
        section={room.section}
        subjectName={room.subjects?.name ?? "Class"}
        currentUserId={profile.id}
        currentUserName={profile.full_name}
        canModerate={profile.role === "admin" || profile.role === "faculty"}
        initialMessages={initialMessages}
        initialReactions={(reactionRows ?? []) as MessageReaction[]}
      />
    </div>
  );
}
