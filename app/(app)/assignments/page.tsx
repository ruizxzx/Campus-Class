import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { assignmentState, latestSubmissions } from "@/lib/assignment-work-state";
import { FileText, Clock3, ArrowUpRight } from "lucide-react";

export default async function StudentAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { class: classId } = await searchParams;
  const validClassId = classId && /^[0-9a-f-]{36}$/i.test(classId) ? classId : null;
  const {data: memberships,error: membershipError} = await supabase.from("class_enrollments").select("class_id").eq("college_id",profile.college_id).eq("student_id",profile.id).eq("status","active");
  if (membershipError) throw new Error("Unable to load your classes.");
  const classIds = (memberships ?? []).map(row=>row.class_id).filter(id=>!validClassId || id===validClassId);
  const assignmentsQuery = supabase.from("assignments")
    .select("id,title,description,due_at,max_marks,class_id,classes(section,subjects(name,code))")
    .eq("college_id", profile.college_id)
    .eq("status", "published")
    .eq("work_type", "assignment")
    .order("due_at", { ascending: true });
  const [assignmentResult, submissionResult] = await Promise.all([
    classIds.length ? assignmentsQuery.in("class_id",classIds) : Promise.resolve({data:[],error:null}),
    supabase.from("assignment_submissions").select("id,assignment_id,status,version").eq("college_id",profile.college_id).eq("student_id", profile.id),
  ]);
  if (assignmentResult.error) {
    console.error("Unable to load class assignments", assignmentResult.error);
    throw new Error("Unable to load assignments.");
  }
  if (submissionResult.error) {
    console.error("Unable to load assignment submissions", submissionResult.error);
    throw new Error("Unable to load submitted work.");
  }
  const assignments = (assignmentResult.data as any[]) ?? [];
  const submitted = latestSubmissions(submissionResult.data ?? []);
  const pendingAssignments = assignments.filter(assignment=>assignmentState(assignment,submitted)!=="completed");
  const submittedAssignments = assignments.filter(assignment=>assignmentState(assignment,submitted)==="completed");

  return (
    <>
      <PageHeader title="Assignments" description="Track published work across your enrolled classes." />
      <div className="space-y-3">
        {pendingAssignments.length ? pendingAssignments.map((assignment) => (
          <Link key={assignment.id} href={`/assignments/${assignment.id}`} className="surface flex flex-wrap items-center gap-4 p-5 transition-colors hover:bg-[var(--surface-2)]">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green)]"><FileText size={18} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{assignment.title}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">{assignment.classes?.subjects?.name ?? "Class"} · Section {assignment.classes?.section ?? "—"}</div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-xs font-semibold">
                <Clock3 size={13} />{assignment.due_at ? new Date(assignment.due_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : "No deadline"}
              </div>
              <div className="mt-1 text-[10px] text-[var(--muted)]">{assignment.max_marks} marks</div>
            </div>
            <ArrowUpRight size={15} className="text-[var(--muted)]" />
          </Link>
        )) : (
          <div className="surface"><EmptyState title="No pending assignments" description="You have no outstanding assignments in this classroom." icon="file" /></div>
        )}
      </div>
      <section className="surface mt-6 p-5">
        <div className="mb-3 text-sm font-semibold">Submitted work</div>
        {submittedAssignments.length ? submittedAssignments.map((assignment) => (
          <Link key={assignment.id} href={`/assignments/${assignment.id}`} className="flex items-center justify-between gap-3 border-t border-[var(--line)] py-3 first:border-0">
            <div>
              <div className="text-xs font-semibold">{assignment.title}</div>
              <div className="mt-1 text-[10px] text-[var(--muted)]">{assignment.classes?.subjects?.name ?? "Class"}</div>
            </div>
            <span className="status-pill green">{submitted.get(assignment.id)?.status === "late" ? "Submitted late" : "Submitted"}</span>
          </Link>
        )) : <p className="text-xs text-[var(--muted)]">No completed submissions yet.</p>}
      </section>
    </>
  );
}
