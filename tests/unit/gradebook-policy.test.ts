import {describe,it,expect} from "vitest";
import {validGradeWeights,weightedRecordedIndex} from "../../lib/gradebook-policy";

describe("per-class Gradebook policy",()=>{
  const weights={assignment_weight:30,project_weight:20,quiz_weight:40,attendance_weight:10};
  const columns=[
    {type:"assignment",maxMarks:100},{type:"project",maxMarks:100},{type:"quiz",maxMarks:100},
  ];
  it("calculates a normalized explicit index from released recorded marks",()=>{
    expect(weightedRecordedIndex({scores:[50,80,60],attendance:100},columns,weights)).toBe(65);
  });
  it("reweights over observed categories rather than penalizing unknown grades",()=>{
    expect(weightedRecordedIndex({scores:[null,80,null],attendance:null},columns,weights)).toBe(80);
    expect(weightedRecordedIndex({scores:[null,null,null],attendance:null},columns,weights)).toBeNull();
  });
  it("refuses arbitrary or unbalanced policies",()=>{
    expect(validGradeWeights({...weights,quiz_weight:50})).toBe(false);
    expect(validGradeWeights({...weights,quiz_weight:40.001})).toBe(false);
    expect(validGradeWeights(weights)).toBe(true);
  });
  it("never turns invalid or over-max marks into an official score",()=>{
    expect(weightedRecordedIndex({scores:[120,null,null],attendance:null},columns,weights)).toBeNull();
  });
});