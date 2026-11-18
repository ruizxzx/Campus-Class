import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStudent } from "../lib/student-success.ts";

test("absent evidence is not labeled academic success or failure", () => {
  const data = summarizeStudent({attendanceSessions:0,attendedSessions:0,assignedWork:0,submittedWork:0,overdueWork:0,releasedQuizScores:[]});
  assert.equal(data.level, "insufficient_data");
  assert.equal(data.attendancePercent, null);
  assert.equal(data.quizPercent, null);
});
test("two independent support signals lead to faculty follow-up", () => {
  const data = summarizeStudent({ attendanceSessions:5,attendedSessions:2,assignedWork:5,submittedWork:1,overdueWork:3,releasedQuizScores:[32,38] });
  assert.equal(data.level,"needs_support");
  assert.equal(data.reasons.length,3);
  assert.equal(data.attendancePercent,40);
});
test("a single signal is a watchlist, not an automatic penalty", () => {
  const data = summarizeStudent({ attendanceSessions:5,attendedSessions:3,assignedWork:3,submittedWork:3,overdueWork:0,releasedQuizScores:[95,96] });
  assert.equal(data.level,"watch");
});
test("invalid quiz samples are excluded", () => {
  const data = summarizeStudent({ attendanceSessions:4,attendedSessions:4,assignedWork:2,submittedWork:2,overdueWork:0,releasedQuizScores:[NaN,120,80,100] });
  assert.equal(data.quizPercent,90);
  assert.equal(data.level,"on_track");
});
