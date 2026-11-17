import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { RadioTower, MessageCircle, Pin } from "lucide-react";
import { format } from "date-fns";

export default async function StreamPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: posts, error } = await supabase.from("class_stream_posts")
    .select("id,title,body,post_type,published_at,pinned_at,classes(display_name,section,subjects(name,code))")
    .not("published_at","is",null).order("pinned_at",{ascending:false,nullsFirst:false})
    .order("published_at",{ascending:false}).limit(50);
  if(error) console.error("Unable to load class stream", error);
  return <><PageHeader title="Class stream" description="College-wide academic updates from your enrolled and assigned classes."/>
    <div className="space-y-3">{posts?.length ? posts.map((post:any)=><article key={post.id} className="surface p-5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"><RadioTower size={13}/>{post.post_type} · {post.classes?.display_name ?? "Class"}{post.pinned_at ? <Pin size={12}/> : null}</div>
      <h2 className="mt-2 text-base font-semibold">{post.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{post.body}</p>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]"><span>{post.classes?.subjects?.name} · Section {post.classes?.section}</span><time>{post.published_at ? format(new Date(post.published_at),"dd MMM · h:mm a"):"Draft"}</time></div>
      <Link className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--green-strong)]" href={`/stream/${post.id}`}><MessageCircle size={14}/>Open discussion</Link>
    </article>) : <EmptyState title="Your stream is quiet" description="Class announcements, questions, materials and updates will appear here."/>}</div>
  </>;
}
