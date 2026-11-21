import { istDate } from "@/lib/display";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { LeaveClassButton } from "@/components/leave-class-button";
import { FileText, Megaphone, Users } from "lucide-react";

export default async function StudentClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["student"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("class_enrollments")
    .select("id")
    .eq("class_id", id)
    .eq("student_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) notFound();

  const { data: clsRaw } = await supabase
    .from("classes")
    .select("id,subject_id,section,semester,academic_year,subjects(name,code,departments(name))")
    .eq("id", id)
    .single();
  const cls: any = clsRaw;
  if (!cls) notFound();

  const [assignments, announcements, facultyLinks] = await Promise.all([
    supabase.from("assignments").select("id,title,due_at,status,max_marks").eq("class_id", id).eq("status", "published").order("due_at"),
    supabase.from("announcements").select("id,title,body,published_at").eq("class_id", id).order("published_at", { ascending: false }),
    supabase.from("class_faculty").select("faculty_id").eq("class_id", id),
  ]);
  const facultyIds = [...new Set((facultyLinks.data ?? []).map((row) => row.faculty_id))];
  const { data: faculty } = facultyIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", facultyIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };

  return <>
    <PageHeader
      title={`${cls.subjects?.name ?? "Classroom"} · ${cls.section}`}
      description={`${cls.subjects?.departments?.name ?? "College"} · ${cls.subjects?.code ?? ""} · Semester ${cls.semester} · ${cls.academic_year}`}
      action={<LeaveClassButton enrollmentId={enrollment.id} />}
    />
    <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Classroom sections">
      {[
        { label: "Overview", href: `/classes/${id}` },
        { label: "Stream", href: `/stream?class=${id}` },
        { label: "Classwork", href: `/assignments?class=${id}` },
        { label: "Courses", href: `/courses?subject=${cls.subject_id}` },
        { label: "People", href: "#people" },
        { label: "Resources", href: `/stream?class=${id}&type=material` },
        { label: "Chat", href: `/chat?class=${id}` },
      ].map((item) => (
        <Link key={item.label} href={item.href} className="btn-secondary shrink-0 !px-3 !py-2 text-xs">
          {item.label}
        </Link>
      ))}
    </nav>
    <section id="people" className="surface mb-5 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold"><Users size={16} />Teaching faculty</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {faculty?.length ? faculty.map((teacher) => (
          <div key={teacher.id} className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
            <div className="text-xs font-semibold">{teacher.full_name}</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{teacher.email}</div>
          </div>
        )) : <p className="text-xs text-[var(--muted)]">No faculty member has been assigned yet.</p>}
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="surface p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} />Class assignments</div>
        <div className="mt-4 space-y-2">
          {assignments.data?.length ? assignments.data.map((assignment) => (
            <Link key={assignment.id} href={`/assignments/${assignment.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
              <div>
                <div className="text-xs font-semibold">{assignment.title}</div>
                <div className="mt-1 text-[10px] text-[var(--muted)]">{assignment.due_at ? istDate(assignment.due_at) : "No deadline"} · {assignment.max_marks} marks</div>
              </div>
              <span className="status-pill green">Open</span>
            </Link>
          )) : <EmptyState title="No assignments" description="Published assignments will appear here." icon="file" />}
        </div>
      </section>
      <section className="surface p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Megaphone size={16} />Announcements</div>
        <div className="mt-4 space-y-3">
          {announcements.data?.length ? announcements.data.map((announcement) => (
            <article key={announcement.id} className="border-t border-[var(--line)] pt-3 first:border-0">
              <div className="text-xs font-semibold">{announcement.title}</div>
              <div className="mt-1 text-[10px] text-[var(--muted)]">{istDate(announcement.published_at,{day:"2-digit",month:"short",year:"numeric"})}</div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">{announcement.body}</p>
            </article>
          )) : <EmptyState title="No announcements" description="Your faculty has not posted an update yet." />}
        </div>
      </section>
    </div>
  </>;
}
