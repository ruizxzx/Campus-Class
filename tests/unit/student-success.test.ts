import {describe,it,expect} from "vitest";
import {summarizeStudent,DEFAULT_SUPPORT_RULES,releasedQuizEvidence} from "../../lib/student-success";

describe("explainable Student Success rules",()=>{
  const empty={attendanceSessions:0,attendedSessions:0,assignedWork:0,
    submittedWork:0,overdueWork:0,releasedQuizScores:[]};
  it("reports insufficient evidence rather than a false low score",()=>{
    const signal=summarizeStudent(empty);
    expect(signal.level).toBe("insufficient_data");
    expect(signal.attendancePercent).toBeNull();
    expect(signal.quizPercent).toBeNull();
  });
  it("uses college-specific intervention thresholds",()=>{
    const signal=summarizeStudent({
      attendanceSessions:5,attendedSessions:3,assignedWork:3,
      submittedWork:1,overdueWork:1,releasedQuizScores:[64,67],
    },{...DEFAULT_SUPPORT_RULES,attendance_min_percent:80,
      overdue_assignment_count:1,quiz_min_percent:70});
    expect(signal.level).toBe("needs_support");
    expect(signal.reasons.length).toBe(3);
  });
  it("keeps the best released score per student and quiz",()=>{
    const result=releasedQuizEvidence([
      {student_id:"s",quiz_id:"q",attempt_number:1,score:90},
      {student_id:"s",quiz_id:"q",attempt_number:2,score:50},
      {student_id:"s",quiz_id:"q",attempt_number:3,score:null},
    ],new Map([["q",100]]));
    expect(result.get("s")).toEqual([90]);
  });
});