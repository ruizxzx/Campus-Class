import { formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { LearningHubHeader } from "@/components/learning-hub-header";
import { StreamCommentForm } from "@/components/stream-comment-form";
import { AISummarizeButton } from "@/components/ai-summarize-button";
import { AIResourceAssistant } from "@/components/ai-resource-assistant";
import { FileText, MessageCircle, Pin } from "lucide-react";

type StreamAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
};

type StreamComment = {
  id: string;
  body: string;
  author_id: string;
  is_private: boolean;
  created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

export default async function StreamDetail({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const profile = await requireProfile();
  const db = await createClient();
  const { data: post, error: postError } = await db.from("class_stream_posts")
    .select("id,title,body,published_at,post_type,pinned_at,classes(display_name,section,subjects(name)),class_topics(name),stream_attachments(id,file_name,storage_path)")
    .eq("id", postId)
    .maybeSingle();
  if (postError) {
    console.error("Unable to load class stream post", postError);
    throw new Error("Unable to load this class stream post.");
  }
  if (!post) notFound();
  const classroom = Array.isArray(post.classes) ? post.classes[0] : post.classes;
  const subject = Array.isArray(classroom?.subjects) ? classroom.subjects[0] : classroom?.subjects;
  const topic = Array.isArray(post.class_topics) ? post.class_topics[0] : post.class_topics;

  const { data: comments, error: commentsError } = await db.from("stream_comments")
    .select("id,body,author_id,is_private,created_at,profiles!stream_comments_college_id_author_id_fkey(full_name)")
    .eq("post_id", postId)
    .order("created_at");
  if (commentsError) {
    console.error("Unable to load stream comments", {
      code: commentsError.code,
      message: commentsError.message,
      details: commentsError.details,
    });
    throw new Error("Unable to load this post's discussion.");
  }

  const attachmentRows = (post.stream_attachments ?? []) as StreamAttachment[];
  const attachments = await Promise.all(attachmentRows.map(async (attachment) => {
    const { data, error } = await db.storage.from("class-stream")
      .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
    if (error) {
      console.error("Unable to create authorized stream attachment link", error);
      return { ...attachment, url: null };
    }
    return { ...attachment, url: data.signedUrl };
  }));
  const commentRows = (comments ?? []) as StreamComment[];
  const isFacultyOrAdmin = profile.role === "faculty" || profile.role === "admin";

  return (
    <>
      <LearningHubHeader
        active="stream"
        title={post.title}
        description={`${classroom?.display_name ?? "Class"} · ${subject?.name ?? ""} · ${post.post_type.replaceAll("_", " ")}`}
        canAuthor={isFacultyOrAdmin}
      />
      <article className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            {post.pinned_at ? <span className="status-pill green"><Pin size={11} />Pinned for this class</span> : null}
            {topic?.name ? <span className="status-pill">{topic.name}</span> : null}
          </div>
          {post.published_at ? (
            <time className="text-[10px] text-[var(--muted)]" dateTime={post.published_at}>
              {formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}
            </time>
          ) : <span className="status-pill">Draft</span>}
        </div>
        <div className="p-5 sm:p-6">
          <p className="whitespace-pre-wrap text-sm leading-7">{post.body}</p>
        <div className="mt-4"><AISummarizeButton resourceType="post" resourceId={postId}/></div>
        <div className="mt-3"><AIResourceAssistant resourceType="post" resourceId={postId} compact /></div>
        {attachments.length ? (
          <ul className="mt-5 grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.url
                  ? <a href={attachment.url} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs font-semibold hover:border-[var(--green)]"><FileText size={16} className="shrink-0 text-[var(--green-strong)]" /><span className="truncate">{attachment.file_name}</span></a>
                  : <span className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]"><FileText size={16} className="shrink-0" /><span className="truncate">{attachment.file_name} · temporarily unavailable</span></span>}
              </li>
            ))}
          </ul>
        ) : null}
        </div>
      </article>
      <section className="surface mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
          <MessageCircle size={16} className="text-[var(--green-strong)]" />
          <h2 className="text-sm font-semibold">Class discussion</h2>
          <span className="status-pill ml-auto">{commentRows.length}</span>
        </div>
        <div className="p-5 sm:p-6">
        <div className="mt-4 space-y-3">
          {commentRows.map((comment) => (
            <div key={comment.id} className="rounded-xl bg-[var(--surface-2)] p-3">
              <div className="text-[10px] font-semibold text-[var(--muted)]">
                {(Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles)?.full_name ?? "Member"}
                {comment.is_private ? " · Private" : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              <time className="mt-2 block text-[10px] text-[var(--muted)]" dateTime={comment.created_at}>
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </time>
            </div>
          ))}
          {!commentRows.length ? <EmptyState title="No comments yet" description="Start a class discussion by adding a comment." /> : null}
        </div>
        {post.published_at && (isFacultyOrAdmin || profile.role === "student") ? (
          <div className="mt-4"><StreamCommentForm postId={postId} /></div>
        ) : null}
        </div>
      </section>
    </>
  );
}
