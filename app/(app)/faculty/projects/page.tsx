import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { Plus, FolderKanban } from "lucide-react";

export default async function FacultyProjectsPage() {
  const profile = await requireRole(["faculty"]);
  const db = await createClient();
  const { data: relations } = await db.from("class_faculty").select("class_id").eq("college_id", profile.college_id).eq("faculty_id", profile.id).eq("can_manage_assignments", true);
  const classIds = (relations ?? []).map((item) => item.class_id);
  const { data: projects } = classIds.length
    ? await db.from("assignments").select("id,title,status,due_at,max_marks,classes(section,subjects(name,code))").eq("college_id", profile.college_id).eq("work_type", "project").in("class_id", classIds).order("created_at", { ascending: false })
    : { data: [] };
  return <>
    <PageHeader title="Projects" description="Create and review project submissions for your assigned classes." action={<Link href="/faculty/assignments/new" className="btn-primary"><Plus size={14}/>New project</Link>}/>
    <section className="surface p-5">
      {(projects ?? []).length ? <div className="divide-y divide-[var(--line)]">{(projects ?? []).map((project: any) => <Link key={project.id} href={`/faculty/assignments/${project.id}`} className="flex items-center gap-3 py-4 first:pt-0">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><FolderKanban size={16}/></div>
        <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{project.title}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{project.classes?.subjects?.name ?? "Class"} · Section {project.classes?.section ?? "—"}</div></div>
        <span className={`status-pill ${project.status === "published" ? "green" : ""}`}>{project.status}</span>
      </Link>)}</div> : <EmptyState title="No projects created" description="Create a project from the assignment composer and set its work type to Project." icon="file"/>}
    </section>
  </>;
}
