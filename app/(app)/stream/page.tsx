import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { LearningHubHeader } from "@/components/learning-hub-header";
import { FileText, MessageCircle, Pin, RadioTower } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const postTypes = ["announcement", "assignment", "quiz", "question", "material", "poll"] as const;
const pageSize = 20;

type StreamSubject = { name: string; code: string };
type StreamClass = {
  display_name: string | null;
  section: string;
  subjects: StreamSubject | StreamSubject[] | null;
};
type StreamTopic = { name: string };
type StreamAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
};
type StreamPostRow = {
  id: string;
  title: string;
  body: string;
  post_type: string;
  published_at: string;
  pinned_at: string | null;
  classes: StreamClass | StreamClass[] | null;
  class_topics: StreamTopic | StreamTopic[] | null;
  stream_attachments: StreamAttachment[] | null;
};
type StreamPostWithDisplay = StreamPostRow & {
  classroom: StreamClass | null;
  subject: StreamSubject | null;
  topic: StreamTopic | null;
  attachments: (StreamAttachment & { url: string | null })[];
};

export default async function StreamPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; type?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const filters = await searchParams;
  const selectedType = postTypes.find((type) => type === filters.type);
  const classId = filters.class && /^[0-9a-f-]{36}$/i.test(filters.class) ? filters.class : null;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const classResult = await supabase.from("classes")
    .select("id,display_name,section")
    .eq("college_id", profile.college_id)
    .order("display_name");
  if (classResult.error) throw new Error("Unable to load accessible classrooms.");

  let query = supabase.from("class_stream_posts")
    .select("id,title,body,post_type,published_at,pinned_at,classes(display_name,section,subjects(name,code)),class_topics(name),stream_attachments(id,file_name,storage_path,mime_type,file_size)")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize);
  if (classId) query = query.eq("class_id", classId);
  if (selectedType) query = query.eq("post_type", selectedType);
  const { data: postRows, error } = await query;
  if (error) {
    console.error("Unable to load class stream", error);
    throw new Error("Unable to load the class stream.");
  }
  const posts = (postRows ?? []) as StreamPostRow[];
  const postIds = posts.map((post) => post.id);
  const commentResult = postIds.length
    ? await supabase.from("stream_comments").select("post_id").in("post_id", postIds)
    : { data: [], error: null };
  if (commentResult.error) throw new Error("Unable to load stream discussion counts.");
  const commentCounts = new Map<string, number>();
  for (const comment of commentResult.data ?? []) {
    commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) ?? 0) + 1);
  }

  const postsWithLinks = await Promise.all(posts.map(async (post): Promise<StreamPostWithDisplay> => {
    const classroom = (Array.isArray(post.classes) ? post.classes[0] : post.classes) ?? null;
    const rawSubject = classroom?.subjects;
    const subject = (Array.isArray(rawSubject) ? rawSubject[0] : rawSubject) ?? null;
    const topic = (Array.isArray(post.class_topics) ? post.class_topics[0] : post.class_topics) ?? null;
    const attachments = await Promise.all((post.stream_attachments ?? []).map(async (attachment) => {
      const { data, error: signedUrlError } = await supabase.storage
        .from("class-stream")
        .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
      if (signedUrlError) {
        console.error("Unable to create authorized stream attachment link", signedUrlError);
        return { ...attachment, url: null };
      }
      return { ...attachment, url: data.signedUrl };
    }));
    return { ...post, classroom, subject, topic, attachments };
  }));
  const nextParams = new URLSearchParams();
  if (classId) nextParams.set("class", classId);
  if (selectedType) nextParams.set("type", selectedType);
  const nextUrl = (nextPage: number) => {
    const params = new URLSearchParams(nextParams);
    params.set("page", String(nextPage));
    return `/stream?${params.toString()}`;
  };

  return (
    <>
      <LearningHubHeader
        active="stream"
        title="Your classroom, in the loop."
        description="Announcements, resources, and conversations shared with the classes you belong to."
        canAuthor={profile.role === "faculty" || profile.role === "admin"}
      />
      <section className="surface-flat mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Class activity</div>
          <div className="mt-1 text-xs text-[var(--muted)]">{posts.length ? `Showing ${posts.length} recent posts` : "Stay close to what is happening in class."}</div>
        </div>
        <form action="/stream" className="grid gap-2 sm:flex">
          <label className="sr-only" htmlFor="stream-class-filter">Filter by class</label>
          <select id="stream-class-filter" name="class" defaultValue={classId ?? ""} className="input-base min-w-0 sm:w-56">
            <option value="">All accessible classes</option>
            {(classResult.data ?? []).map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroom.display_name} · {classroom.section}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="stream-type-filter">Filter by post type</label>
          <select id="stream-type-filter" name="type" defaultValue={selectedType ?? ""} className="input-base min-w-0 sm:w-44">
            <option value="">All post types</option>
            {postTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
          <button className="btn-secondary" type="submit">Apply filters</button>
        </form>
      </section>

      <div className="space-y-4">
        {postsWithLinks.length ? postsWithLinks.map((post) => (
          <article key={post.id} className={`surface overflow-hidden ${post.pinned_at ? "border-[var(--green)]" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5 sm:px-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><RadioTower size={14} /></span>
                <span>{post.classroom?.display_name ?? "Class"}{post.classroom?.section ? ` · ${post.classroom.section}` : ""}</span>
                <span className="text-[var(--line)]" aria-hidden="true">/</span>
                <span>{post.post_type.replaceAll("_", " ")}</span>
              </div>
              <div className="flex items-center gap-2">
                {post.pinned_at ? <span className="status-pill green"><Pin size={11} />Pinned</span> : null}
                <time className="text-[10px] text-[var(--muted)]" dateTime={post.published_at}>
                  {formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}
                </time>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {post.subject?.name ? <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{post.subject.name}</span> : null}
                {post.topic?.name ? <span className="status-pill">{post.topic.name}</span> : null}
              </div>
              <h2 className="mt-2 text-lg font-semibold leading-6 tracking-[-.025em]">{post.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{post.body}</p>
            {post.attachments.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {post.attachments.map((attachment) => (
                  <li key={attachment.id} className="min-w-0">
                    {attachment.url
                      ? <a href={attachment.url} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs font-semibold hover:border-[var(--green)]"><FileText size={16} className="shrink-0 text-[var(--green-strong)]" /><span className="truncate">{attachment.file_name}</span></a>
                      : <span className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]"><FileText size={16} className="shrink-0" /><span className="truncate">{attachment.file_name} · temporarily unavailable</span></span>}
                  </li>
                ))}
              </ul>
            ) : null}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <span className="text-[10px] text-[var(--muted)]">{post.subject?.code ? `${post.subject.code} · ` : ""}{post.classroom?.section ? `Section ${post.classroom.section}` : ""}</span>
                <Link className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[var(--green-strong)] transition-colors hover:bg-[var(--green-soft)]" href={`/stream/${post.id}`}>
                  <MessageCircle size={14} />{commentCounts.get(post.id) ?? 0} comments <span className="hidden sm:inline">· Join discussion</span>
                </Link>
              </div>
            </div>
          </article>
        )) : <EmptyState title="Your stream is quiet" description="Class announcements, questions, materials and updates will appear here." />}
      </div>

      <nav className="mt-5 flex justify-between" aria-label="Stream pages">
        {page > 1 ? <Link className="btn-secondary" href={nextUrl(page - 1)}>Newer posts</Link> : <span />}
        {posts.length === pageSize ? <Link className="btn-secondary" href={nextUrl(page + 1)}>Older posts</Link> : null}
      </nav>
    </>
  );
}
