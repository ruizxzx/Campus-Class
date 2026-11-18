"use client";
import { nowEpochMs } from "@/lib/time";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, CheckCircle2, ClipboardCopy, QrCode, ShieldCheck, Users, XCircle } from "lucide-react";

type Classroom = { id: string; name: string };
type Session = { id: string; class_id: string; title: string; starts_at: string; expires_at: string; closed_at: string | null };
type RecordRow = { id: string; session_id: string; class_id: string; student_id: string; status: string; recorded_at: string };
type Roster = { class_id: string; student_id: string; name: string };
type Issued = { session: { id: string; title: string; expires_at: string }; checkinLink: string; qrSvg: string };

export function AttendanceWorkspace({ role, classes, sessions, records, roster, initialSession, initialToken, loadError }: {
  role: "admin" | "faculty" | "student"; classes: Classroom[]; sessions: Session[];
  records: RecordRow[]; roster: Roster[]; initialSession: string; initialToken: string; loadError: string | null;
}) {
  const router = useRouter();
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("Today's class");
  const [minutes, setMinutes] = useState(10);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [working, setWorking] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [sessionId, setSessionId] = useState(initialSession);
  const staff = role !== "student";
  const classSessions = useMemo(() => sessions.filter((session) => session.class_id === classId), [sessions, classId]);
  const count = (id: string) => records.filter((record) => record.session_id === id && ["present", "late"].includes(record.status)).length;
  const completed = classSessions.filter((session) => session.closed_at || Date.parse(session.expires_at) < nowEpochMs());
  const attended = completed.filter((session) => records.some((record) => record.session_id === session.id && ["present", "late"].includes(record.status))).length;
  const rate = completed.length ? Math.round(attended / completed.length * 100) : null;

  async function action(body: object) {
    const response = await fetch("/api/attendance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "Attendance request failed.");
    return result;
  }

  async function start() {
    if (!classId) return;
    setWorking(true);
    try {
      const result = await action({ action: "create", class_id: classId, title, minutes }) as Issued;
      setIssued(result);
      toast.success("Attendance session is ready. Display the QR code to your class.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start attendance.");
    } finally { setWorking(false); }
  }

  async function checkin() {
    if (!token.trim() || !sessionId.trim()) return toast.error("Scan the faculty QR code or enter your check-in link.");
    setWorking(true);
    try {
      const result = await action({ action: "checkin", session_id: sessionId.trim(), token: token.trim() });
      toast.success(result.alreadyCheckedIn ? "Your attendance was already marked." : "Attendance marked successfully!");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check in.");
    } finally { setWorking(false); }
  }

  async function manage(body: object, message: string) {
    setWorking(true);
    try {
      await action(body);
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update attendance.");
    } finally { setWorking(false); }
  }

  const selectClass = <label className="block text-xs font-semibold text-[var(--muted)]">
    Class section
    <select className="input-base mt-2" value={classId} onChange={(event) => setClassId(event.target.value)}>
      {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
    </select>
  </label>;

  return <div className="space-y-5">
    {loadError && <div role="alert" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">{loadError}</div>}
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="surface p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><CalendarCheck2 size={16}/>Recorded sessions</div><div className="mt-3 text-3xl font-bold tabular-nums">{classSessions.length}</div></div>
      <div className="surface p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Users size={16}/>{staff ? "Enrolled learners" : "Your attendance"}</div><div className="mt-3 text-3xl font-bold tabular-nums">{staff ? roster.filter((item) => item.class_id === classId).length : (rate === null ? "—" : rate + "%")}</div></div>
      <div className="surface p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><ShieldCheck size={16}/>Protected check-in</div><div className="mt-3 text-sm font-semibold">Enrollment verified</div><p className="mt-1 text-xs text-[var(--muted)]">Tokens expire within 30 minutes.</p></div>
    </div>

    {!classes.length ? <div className="surface p-8 text-sm text-[var(--muted)]">No active class is available for this account.</div> : <>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {staff ? <section className="surface min-w-0 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2"><QrCode size={20} className="text-[var(--green)]"/><h2 className="text-base font-semibold">Start an attendance session</h2></div>
          <div className="space-y-4">{selectClass}
            <label className="block text-xs font-semibold">Session name<input className="input-base mt-2" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)}/></label>
            <label className="block text-xs font-semibold">Check-in duration<select className="input-base mt-2" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>{[3,5,10,15,20,30].map((item) => <option key={item} value={item}>{item} minutes</option>)}</select></label>
            <button className="btn-primary w-full" disabled={working || !classId || title.trim().length < 2} onClick={start}>Generate QR attendance</button>
          </div>
          {issued && <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-4 text-center text-slate-900">
            <div className="mx-auto max-w-[280px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: issued.qrSvg }}/>
            <div className="mt-3 text-sm font-semibold">{issued.session.title}</div>
            <p className="mt-1 text-xs">Expires {new Date(issued.session.expires_at).toLocaleTimeString()}</p>
            <button type="button" className="btn-secondary mt-3" onClick={() => { void navigator.clipboard.writeText(issued.checkinLink).then(() => toast.success("Check-in link copied.")).catch(() => toast.error("Copy failed.")); }}><ClipboardCopy size={15}/> Copy check-in link</button>
            <p className="mt-3 text-xs text-slate-600">Display this code to students. Do not post it publicly.</p>
          </div>}
        </section> : <section className="surface min-w-0 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><QrCode size={20} className="text-[var(--green)]"/><h2 className="text-base font-semibold">Check in to your class</h2></div>
          <p className="mb-4 text-xs leading-6 text-[var(--muted)]">Scan your faculty member&apos;s QR code. Confirm your attendance after opening the link. QR codes are time-limited, but are not proof of physical proximity.</p>
          {selectClass}
          <label className="mt-4 block text-xs font-semibold">Session ID<input className="input-base mt-2" value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="Filled when you scan the QR code"/></label>
          <label className="mt-4 block text-xs font-semibold">Check-in token<input className="input-base mt-2" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Filled when you scan the QR code"/></label>
          <button type="button" disabled={working || !sessionId || !token} className="btn-primary mt-5 w-full" onClick={checkin}><CheckCircle2 size={16}/>Confirm check-in</button>
        </section>}

        <section className="surface min-w-0 p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Recent sessions</h2>
          <div className="max-h-[490px] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {!classSessions.length && <p className="text-xs text-[var(--muted)]">No attendance sessions for this class yet.</p>}
            {classSessions.map((session) => {
              const ended = Boolean(session.closed_at) || Date.parse(session.expires_at) < nowEpochMs();
              return <div key={session.id} className="rounded-2xl border border-[var(--line)] p-3 sm:p-4">
                <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{session.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Date(session.starts_at).toLocaleString()}</p></div><span className={"status-pill " + (ended ? "" : "green")}>{ended ? "Ended" : "Active"}</span></div>
                <div className="mt-3 text-xs text-[var(--muted)]">{staff ? count(session.id) + " checked in" : (records.some((record) => record.session_id === session.id && ["present","late"].includes(record.status)) ? "You attended" : ended ? "No check-in recorded" : "Awaiting check-in")}</div>
                {staff && !ended && <button className="btn-secondary mt-3 !py-2" disabled={working} onClick={() => manage({ action: "close", session_id: session.id }, "Session closed.")}><XCircle size={14}/>Close session</button>}
                {staff && roster.filter((student) => student.class_id === classId).length > 0 && <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer text-xs font-semibold">View and correct attendance</summary>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {roster.filter((student) => student.class_id === classId).map((student) => {
                      const record = records.find((item) => item.session_id === session.id && item.student_id === student.student_id);
                      return <div key={student.student_id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{student.name}</span><select aria-label={"Attendance for " + student.name} className="max-w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2" value={record?.status ?? "unmarked"} disabled={working} onChange={(event) => manage({ action: "correct", session_id: session.id, student_id: student.student_id, status: event.target.value }, "Attendance updated.")}><option value="unmarked" disabled>Unmarked</option>{["present","late","absent","excused"].map((item) => <option key={item} value={item}>{item}</option>)}</select></div>;
                    })}
                  </div>
                </details>}
              </div>;
            })}
          </div>
        </section>
      </div>
    </>}
  </div>;
}
