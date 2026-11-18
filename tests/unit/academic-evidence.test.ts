import {describe,it,expect} from "vitest";
import {bestReleasedQuizScores,collectEvidence,releasedAssignmentMarks} from "../../lib/academic-evidence";

describe("released academic evidence",()=>{
  it("retains only the latest submitted assignment version if its grade was released",()=>{
    const records=[
      {id:"v1",assignment_id:"a",student_id:"s",version:1},
      {id:"v2",assignment_id:"a",student_id:"s",version:2},
    ];
    expect(releasedAssignmentMarks(records,[
      {submission_id:"v1",marks:98,released_at:"2026-01-01"},
      {submission_id:"v2",marks:60,released_at:null},
    ]).size).toBe(0);
    expect(releasedAssignmentMarks(records,[
      {submission_id:"v1",marks:98,released_at:"2026-01-01"},
      {submission_id:"v2",marks:60,released_at:"2026-01-02"},
    ]).get("a:s")).toBe(60);
  });
  it("deduplicates multiple quiz attempts with one best released score",()=>{
    const values=bestReleasedQuizScores([
      {quiz_id:"q",student_id:"s",score:80,released_at:"2026-01-01"},
      {quiz_id:"q",student_id:"s",score:10,released_at:"2026-01-02"},
      {quiz_id:"q",student_id:"x",score:99,released_at:null},
    ]);
    expect(values.size).toBe(1);
    expect(values.get("q:s")).toBe(80);
  });
  it("detects incomplete source queries rather than silently truncating",async()=>{
    const result=await collectEvidence(["id"],async(_batch,from)=>{
      if(from===0)return{data:Array.from({length:1000},(_,i)=>i),error:null};
      return{data:[1000],error:null};
    });
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.data.length).toBe(1001);
  });
});