/**
 * Explainable academic support signals, NOT a predictive ML model or diagnosis.
 * Missing evidence is represented as null, never as a failing grade.
 * Decisions remain with faculty; the app must not automatically penalize students.
 */
export type SupportRules = {
  attendance_min_percent:number;
  overdue_assignment_count:number;
  quiz_min_percent:number;
  min_attendance_sessions:number;
  min_assigned_work:number;
  min_released_quizzes:number;
};
export const DEFAULT_SUPPORT_RULES:SupportRules={
  attendance_min_percent:75,overdue_assignment_count:2,quiz_min_percent:50,
  min_attendance_sessions:3,min_assigned_work:2,min_released_quizzes:2,
};
export function validSupportRules(rules:SupportRules):boolean {
  return Number.isFinite(rules.attendance_min_percent)
    && rules.attendance_min_percent>=0&&rules.attendance_min_percent<=100
    && Number.isFinite(rules.quiz_min_percent)
    && rules.quiz_min_percent>=0&&rules.quiz_min_percent<=100
    && [rules.overdue_assignment_count,rules.min_attendance_sessions,
      rules.min_assigned_work,rules.min_released_quizzes]
      .every((value)=>Number.isInteger(value)&&value>=1&&value<=100);
}
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

export function summarizeStudent(
  input:StudentSignalInput,rules:SupportRules=DEFAULT_SUPPORT_RULES,
):StudentSignal {
  if(!validSupportRules(rules))throw new Error("Invalid Student Success support rules.");
  const bounded = (number: number) => Math.min(100, Math.max(0, Math.round(number)));
  const attendancePercent = input.attendanceSessions > 0
    ? bounded(input.attendedSessions / input.attendanceSessions * 100) : null;
  const submissionPercent = input.assignedWork > 0
    ? bounded(input.submittedWork / input.assignedWork * 100) : null;
  const quizzes = input.releasedQuizScores.filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const quizPercent = quizzes.length
    ? bounded(quizzes.reduce((total, value) => total + value, 0) / quizzes.length) : null;

  const reasons: string[] = [];
  if (input.attendanceSessions >= rules.min_attendance_sessions && attendancePercent !== null && attendancePercent < rules.attendance_min_percent) {
    reasons.push("Attendance below "+rules.attendance_min_percent+"% across recorded sessions");
  }
  if (input.overdueWork >= rules.overdue_assignment_count) {
    reasons.push(String(input.overdueWork) + " overdue assignments without recorded submissions");
  }
  if (quizzes.length >= rules.min_released_quizzes && quizPercent !== null && quizPercent < rules.quiz_min_percent) {
    reasons.push("Average released quiz score below "+rules.quiz_min_percent+"%");
  }
  const evidenceCount = Number(input.attendanceSessions >= rules.min_attendance_sessions) + Number(input.assignedWork >= rules.min_assigned_work) + Number(quizzes.length >= rules.min_released_quizzes);
  const level = reasons.length >= 2 ? "needs_support"
    : reasons.length === 1 ? "watch"
    : evidenceCount < 3 ? "insufficient_data"
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
