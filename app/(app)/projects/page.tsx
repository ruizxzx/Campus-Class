import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { FolderKanban, Clock3, ArrowUpRight } from "lucide-react";

export default async function StudentProjectsPage() {
  const profile = await requireRole(["student"]);
  const db = await createClient();
  const { data: projects } = await db.from("assignments")
    .select("id,title,description,due_at,max_marks,class_id,classes(section,subjects(name,code))")
    .eq("college_id", profile.college_id)
    .eq("status", "published")
    .eq("work_type", "project")
    .order("due_at", { ascending: true });
  return <>
    <PageHeader title="Projects" description="Submit and track published project work across your enrolled classes."/>
    <div className="space-y-3">
      {(projects ?? []).length ? (projects ?? []).map((project: any) => <Link key={project.id} href={`/assignments/${project.id}`} className="surface flex flex-wrap items-center gap-4 p-5 hover:bg-[var(--surface-2)]">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><FolderKanban size={18}/></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{project.title}</div><div className="mt-1 text-[11px] text-[var(--muted)]">{project.classes?.subjects?.name ?? "Class"} · Section {project.classes?.section ?? "—"}</div></div>
        <div className="text-right"><div className="flex items-center gap-1 text-xs font-semibold"><Clock3 size={13}/>{project.due_at ? new Date(project.due_at).toLocaleString() : "No deadline"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{project.max_marks} marks</div></div>
        <ArrowUpRight size={15} className="text-[var(--muted)]"/>
      </Link>) : <div className="surface"><EmptyState title="No projects published" description="Project briefs assigned to your enrolled classes will appear here." icon="file"/></div>}
    </div>
  </>;
}
