import {collectEvidence} from "@/lib/academic-evidence";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui";
import { AttendanceWorkspace } from "@/components/attendance-workspace";

type Query = { session?: string; token?: string };
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Query> }) {
  const profile = await requireProfile();
  const query = await searchParams;
  const db = await createClient();
  const collegeId = profile.college_id;
  const classScope = profile.role === "admin"
    ? null
    : profile.role === "faculty"
      ? await db.from("class_faculty").select("class_id").eq("college_id", collegeId).eq("faculty_id", profile.id)
      : await db.from("class_enrollments").select("class_id").eq("college_id", collegeId).eq("student_id", profile.id).eq("status", "active");
  const ids = classScope?.data?.map((item) => item.class_id) ?? [];
  const classQuery = db.from("classes")
    .select("id,display_name,section,subjects(name,code)")
    .eq("college_id", collegeId).eq("is_active", true).order("display_name");
  const { data: classes, error: classError } = profile.role === "admin"
    ? await classQuery.limit(150)
    : ids.length ? await classQuery.in("id", ids).limit(150) : { data: [], error: null };
  const allowedIds = (classes ?? []).map((item) => item.id);
  const history=await collectEvidence<{id:string;class_id:string;title:string;starts_at:string;expires_at:string;closed_at:string|null}>(allowedIds,async(batch,from,to)=>db.from("attendance_sessions").select("id,class_id,title,starts_at,expires_at,closed_at").eq("college_id",collegeId).in("class_id",batch).order("starts_at",{ascending:false}).order("id").range(from,to));
  const sessions=history.data;
  const sessionError=history.error||history.truncated;
  const sessionIds = (sessions ?? []).map((item) => item.id);
  const attendance=await collectEvidence<{id:string;session_id:string;class_id:string;student_id:string;status:string;recorded_at:string}>(sessionIds,async(batch,from,to)=>db.from("attendance_records").select("id,session_id,class_id,student_id,status,recorded_at").eq("college_id",collegeId).in("session_id",batch).order("id").range(from,to));
  const records=attendance.data;
  const recordError=attendance.error||attendance.truncated;
  // Faculty rosters are restricted to their assigned classes, even though this
  // query uses the service client to avoid exposing other private profile data.
  const admin = createAdminClient();
  const { data: enrollments } = profile.role !== "student" && allowedIds.length
    ? await admin.from("class_enrollments").select("class_id,student_id").eq("college_id", collegeId)
        .eq("status", "active").in("class_id", allowedIds).limit(2000)
    : { data: [] };
  const studentIds = [...new Set((enrollments ?? []).map((item) => item.student_id))];
  const { data: students } = studentIds.length
    ? await admin.from("profiles").select("id,full_name").eq("college_id", collegeId).in("id", studentIds).limit(2000)
    : { data: [] };
  const names = new Map((students ?? []).map((item) => [item.id, item.full_name]));
  const roster = (enrollments ?? []).map((item) => ({ ...item, name: names.get(item.student_id) ?? "Student" }));
  const error = classError || classScope?.error || sessionError || recordError
    ? "Some attendance records could not be loaded. Apply migration 202611180026 and refresh."
    : null;

  return <>
    <PageHeader title="Smart attendance" description="Time-limited, enrollment-verified QR check-ins and transparent attendance records."/>
    <AttendanceWorkspace
      role={profile.role}
      classes={(classes ?? []).map((item) => {
        const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
        return { id: item.id, name: (subject?.name ?? item.display_name ?? "Class") + " · " + item.section };
      })}
      sessions={sessions ?? []}
      records={records ?? []}
      roster={roster}
      initialSession={typeof query.session === "string" ? query.session : ""}
      initialToken={typeof query.token === "string" ? query.token : ""}
      loadError={error}
    />
  </>;
}
