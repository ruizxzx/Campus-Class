// Server-side evidence completeness guard: no partial gradebook/analytics output.
export type EvidencePage<T> = { data: T[] | null; error: { code: string } | null };
export async function collectEvidence<T>(
  ids: string[],
  fetchPage: (batch: string[], from: number, to: number) => Promise<EvidencePage<T>>,
): Promise<{ data: T[]; error: { code: string } | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    let ended = false;
    for (let offset = 0; offset < 50000; offset += 1000) {
      const result = await fetchPage(batch, offset, offset + 999);
      if (result.error) return { data: rows, error: result.error, truncated: false };
      const batchRows = result.data ?? [];
      rows.push(...batchRows);
      if (batchRows.length < 1000) { ended = true; break; }
    }
    if (!ended) return { data: rows, error: null, truncated: true };
  }
  return { data: rows, error: null, truncated: false };
}

export type ReleasedAttempt = { quiz_id: string; student_id: string; score: number | null; released_at: string | null };
export function bestReleasedQuizScores(attempts: ReleasedAttempt[]): Map<string,number> {
  const best = new Map<string,number>();
  for (const item of attempts) {
    if (!item.released_at || item.score === null || !Number.isFinite(Number(item.score))) continue;
    const key = item.quiz_id + ":" + item.student_id;
    const score = Number(item.score);
    if (!best.has(key) || score > best.get(key)!) best.set(key,score);
  }
  return best;
}

// Avoid counting unpublished draft marks as attainment evidence.
export type ReleasedEvaluation = { submission_id: string; marks: number; released_at: string | null };
export function releasedAssignmentMarks(
  submissions: { id:string; assignment_id:string; student_id:string; version:number }[],
  evaluations: ReleasedEvaluation[],
): Map<string,number> {
  const evaluationsById = new Map(evaluations.filter((value)=>Boolean(value.released_at))
    .map((value)=>[value.submission_id,Number(value.marks)]));
  const latest = new Map<string,{ id:string; version:number }>();
  for (const submission of submissions) {
    const key=submission.assignment_id+":"+submission.student_id;
    const existing=latest.get(key);
    if (!existing || submission.version>existing.version) {
      latest.set(key,{id:submission.id,version:submission.version});
    }
  }
  const values = new Map<string,number>();
  for (const [key,submission] of latest) {
    const mark=evaluationsById.get(submission.id);
    if (mark!==undefined && Number.isFinite(mark)) values.set(key,mark);
  }
  return values;
}
