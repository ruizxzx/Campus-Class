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
