import {describe,it,expect} from "vitest";
import {attendanceForStudent,weeklyAcademicTrends} from "../../lib/attendance-metrics";

describe("fair and observed attendance metrics",()=>{
  it("exempts excused sessions",()=>{
    expect(attendanceForStudent(["one","two","three"],[
      {session_id:"one",status:"present"},
      {session_id:"two",status:"excused"},
      {session_id:"three",status:"absent"},
    ])).toEqual({attended:1,eligible:2,percent:50});
  });
  it("does not penalize a later joiner for an earlier class session",()=>{
    const now=Date.parse("2026-11-18T12:00:00Z");
    const weeks=weeklyAcademicTrends([
      {id:"old",starts_at:"2026-11-16T10:00:00Z",
        expires_at:"2026-11-16T10:20:00Z",closed_at:null},
    ],[{session_id:"old",student_id:"a",status:"present"}],
    [],new Map(),[
      {student_id:"a",enrolled_at:"2026-10-01T00:00:00Z"},
      {student_id:"b",enrolled_at:"2026-11-17T00:00:00Z"},
    ],now);
    expect(weeks[7].attendance).toBe(100);
    expect(weeks[7].releasedQuiz).toBeNull();
  });
});