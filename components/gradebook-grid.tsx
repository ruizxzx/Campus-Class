"use client";
import { useRouter } from "next/navigation";
import { Download, GraduationCap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Column = { key: string; title: string; type: string; maxMarks: number };
type Row = { id: string; name: string; scores: (number | null)[]; attendance: number | null };

export function GradebookGrid({ classes, classId, columns, rows, staff }: {
  classes: { id: string; name: string }[]; classId: string; columns: Column[]; rows: Row[]; staff: boolean;
}) {
  const router = useRouter();
  const avg = rows.flatMap((row) => row.scores.map((score,index) => score === null ? null :
    columns[index]?.maxMarks > 0 ? Math.min(100,score / columns[index].maxMarks * 100) : null))
    .filter((item): item is number => item !== null);
  const overall = avg.length ? Math.round(avg.reduce((a,b)=>a+b,0) / avg.length) : null;

  function exportCsv() {
    const clean = (cell: string | number) => {
      const value = String(cell);
      // Neutralize CSV formulas when opened in spreadsheet applications.
      const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
      return '"' + safe.replaceAll('"','""') + '"';
    };
    const lines = [
      ["Student","Attendance %",...columns.map((item) => item.title + " (" + item.maxMarks + ")")],
      ...rows.map((row) => [row.name, row.attendance ?? "—",...row.scores.map((item) => item ?? "—")]),
    ].map((items) => items.map((item) => clean(item)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([lines],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download="campusclass-gradebook.csv";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    toast.success("Gradebook exported.");
  }

  return <div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Learners</p><p className="mt-3 text-3xl font-bold">{rows.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Published assessments</p><p className="mt-3 text-3xl font-bold">{columns.length}</p></div>
      <div className="surface p-5"><p className="text-xs text-[var(--muted)]">Recorded-score average</p><p className="mt-3 text-3xl font-bold">{overall === null ? "—" : overall + "%"}</p></div>
    </div>
    <section className="surface min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><GraduationCap size={19}/>Gradebook</h2><p className="mt-1 text-xs text-[var(--muted)]">Blank scores are not counted as zeros.</p></div>
        <div className="flex flex-wrap gap-2"><select value={classId} className="input-base !w-auto max-w-full" aria-label="Choose class" onChange={(event) => router.push("/gradebook?class_id=" + encodeURIComponent(event.target.value))}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {staff && <button type="button" className="btn-secondary" onClick={exportCsv}><Download size={15}/>CSV</button>}
        </div>
      </div>
      <div className="table-wrap"><table className="table-base min-w-[540px]">
        <thead><tr><th>Student</th><th>Attendance</th>{columns.map((column) => <th key={column.key}><div className="max-w-44 whitespace-normal">{column.title}</div><span className="text-[10px] font-normal capitalize">{column.type} · /{column.maxMarks}</span></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td className="font-semibold">{row.name}</td><td>{row.attendance === null ? "—" : row.attendance + "%"}</td>{columns.map((column,index) => <td key={column.key} className="tabular-nums">{row.scores[index] === null ? "—" : row.scores[index]}</td>)}</tr>)}</tbody>
      </table>{rows.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">No students are enrolled in this class.</p>}</div>
    </section>
    <div className="flex items-start gap-2 text-xs leading-6 text-[var(--muted)]"><ShieldCheck size={17} className="shrink-0"/>Official marks are released by authorized faculty. Missing grades are displayed as unavailable, not as failures.</div>
  </div>;
}
