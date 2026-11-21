export type WorkSubmission = { assignment_id: string; status: string; version?: number };
export type WorkAssignment = { id: string; due_at: string | null };
export function latestSubmissions<T extends WorkSubmission>(submissions: T[]): Map<string,T> {
  const result = new Map<string,T>();
  for (const row of submissions) {
    const previous = result.get(row.assignment_id);
    if (!previous || (row.version ?? 0) >= (previous.version ?? 0)) result.set(row.assignment_id,row);
  }
  return result;
}
export function assignmentState(assignment: WorkAssignment, submitted: ReadonlyMap<string,WorkSubmission>, now = Date.now()) {
  if (submitted.has(assignment.id)) return "completed" as const;
  return assignment.due_at && Date.parse(assignment.due_at) < now ? "missing" as const : "assigned" as const;
}
export function awaitingRelease(total: number, released: number) {
  return Math.max(total - released,0);
}
