/**
 * Explainable academic support signals, NOT a predictive ML model or diagnosis.
 * Missing evidence is represented as null, never as a failing grade.
 * Decisions remain with faculty; the app must not automatically penalize students.
 */
export type StudentSignalInput = {
  attendanceSessions: number;
  attendedSessions: number;
  assignedWork: number;
  submittedWork: number;
  overdueWork: number;
  releasedQuizScores: number[];
};

export type StudentSignal = {
  attendancePercent: number | null;
  submissionPercent: number | null;
  quizPercent: number | null;
  level: "insufficient_data" | "on_track" | "watch" | "needs_support";
  reasons: string[];
  evidenceCount: number;
};

export function summarizeStudent(input: StudentSignalInput): StudentSignal {
  const bounded = (number: number) => Math.min(100, Math.max(0, Math.round(number)));
  const attendancePercent = input.attendanceSessions > 0
    ? bounded(input.attendedSessions / input.attendanceSessions * 100) : null;
  const submissionPercent = input.assignedWork > 0
    ? bounded(input.submittedWork / input.assignedWork * 100) : null;
  const quizzes = input.releasedQuizScores.filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const quizPercent = quizzes.length
    ? bounded(quizzes.reduce((total, value) => total + value, 0) / quizzes.length) : null;

  const reasons: string[] = [];
  if (input.attendanceSessions >= 3 && attendancePercent !== null && attendancePercent < 75) {
    reasons.push("Attendance below 75% across recorded sessions");
  }
  if (input.overdueWork >= 2) {
    reasons.push(String(input.overdueWork) + " overdue assignments without recorded submissions");
  }
  if (quizzes.length >= 2 && quizPercent !== null && quizPercent < 50) {
    reasons.push("Average released quiz score below 50%");
  }
  const evidenceCount = Number(input.attendanceSessions >= 3) + Number(input.assignedWork >= 2) + Number(quizzes.length >= 2);
  const level = evidenceCount === 0 ? "insufficient_data"
    : reasons.length >= 2 ? "needs_support"
    : reasons.length === 1 ? "watch"
    : "on_track";
  return { attendancePercent, submissionPercent, quizPercent, level, reasons, evidenceCount };
}


/**
 * One valid released score per student and quiz: the best released attempt,\n * consistent with the Gradebook and Outcomes calculation.
 * Unreleased/missing/invalid scores are absent, not silently treated as zero.
 */
export function releasedQuizEvidence(
  attempts: { student_id: string; quiz_id: string; attempt_number: number; score: number | string | null }[],
  maxMarksByQuiz: Map<string, number>,
): Map<string, number[]> {
  const best = new Map<string, { studentId: string; percent: number }>();
  for (const attempt of attempts) {
    const max = maxMarksByQuiz.get(attempt.quiz_id);
    const score = attempt.score === null ? NaN : Number(attempt.score);
    if (!max || !Number.isFinite(max) || max <= 0 || !Number.isFinite(score)
      || score < 0 || score > max || !Number.isInteger(attempt.attempt_number)
      || attempt.attempt_number < 1) continue;
    const key = attempt.student_id + ":" + attempt.quiz_id;
    const previous = best.get(key);
    const percent = Math.round(score / max * 10000) / 100;
    if (!previous || percent > previous.percent) {
      best.set(key, { studentId: attempt.student_id, percent });
    }
  }
  const byStudent = new Map<string, number[]>();
  for (const item of best.values()) {
    const values = byStudent.get(item.studentId) ?? [];
    values.push(item.percent);
    byStudent.set(item.studentId, values);
  }
  return byStudent;
}
