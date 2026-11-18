import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function FacultyAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const profile = await requireRole(["faculty"]);
  const supabase = await createClient();
  const { class: classId } = await searchParams;
  const validClassId = classId && /^[0-9a-f-]{36}$/i.test(classId) ? classId : null;
  let query = supabase.from("assignments")
    .select("id,title,status,due_at,max_marks,classes(section,subjects(name,code))")
    .eq("college_id", profile.college_id)
    .eq("work_type", "assignment")
    .order("created_at", { ascending: false });
  if (validClassId) query = query.eq("class_id", validClassId);
  const { data: assignments, error } = await query;
  if (error) {
    console.error("Unable to load faculty assignments", error);
    throw new Error("Unable to load assignments.");
  }

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Create assignments and track work published to your classrooms."
        action={<Link href={validClassId ? `/faculty/assignments/new?class=${validClassId}` : "/faculty/assignments/new"} className="btn-primary"><Plus size={14} />New assignment</Link>}
      />
      <section className="surface p-5">
        <div className="table-wrap">
          <table className="table-base">
            <thead><tr><th>Assignment</th><th>Class</th><th>Deadline</th><th>Marks</th><th>Status</th></tr></thead>
            <tbody>
              {assignments?.length ? assignments.map((assignment: any) => (
                <tr key={assignment.id}>
                  <td><Link href={`/faculty/assignments/${assignment.id}`} className="font-semibold hover:text-[var(--green)]">{assignment.title}</Link></td>
                  <td>{assignment.classes?.subjects?.name ?? "Class"} · {assignment.classes?.section ?? "—"}</td>
                  <td>{assignment.due_at ? new Date(assignment.due_at).toLocaleString() : "No deadline"}</td>
                  <td>{assignment.max_marks}</td>
                  <td><span className={`status-pill ${assignment.status === "published" ? "green" : ""}`}>{assignment.status}</span></td>
                </tr>
              )) : (
                <tr><td colSpan={5}><EmptyState title="No assignments created" description="Create a new assignment for one of your assigned classes." action={<Link href="/faculty/assignments/new" className="btn-secondary">Create assignment</Link>} icon="file" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
