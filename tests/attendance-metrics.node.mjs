import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
const source=readFileSync(new URL("../lib/attendance-metrics.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2022}}).outputText;
const lib={};
runInNewContext(compiled,{exports:lib,Date,Map,Set,Math,Number,Array});
test("excused records are exempt from attendance denominator",()=>{
  const value=lib.attendanceForStudent(["s1","s2","s3"],[
    {session_id:"s1",status:"present"},
    {session_id:"s2",status:"excused"},
    {session_id:"s3",status:"absent"},
  ]);
  assert.equal(value.eligible,2);
  assert.equal(value.attended,1);
  assert.equal(value.percent,50);
});
test("all-excused sessions are not silently graded zero",()=>{
  const value=lib.attendanceForStudent(["s1"],[{session_id:"s1",status:"excused"}]);
  assert.equal(value.percent,null);
  assert.equal(value.eligible,0);
});
test("weekly trends only count completed sessions and released best attempts",()=>{
  const now=Date.parse("2026-11-18T12:00:00Z");
  const signals=lib.weeklyAcademicTrends([
    {id:"mon",starts_at:"2026-11-16T10:00:00Z",expires_at:"2026-11-16T10:15:00Z",closed_at:null},
    {id:"open",starts_at:"2026-11-18T12:00:00Z",expires_at:"2026-11-18T12:20:00Z",closed_at:null},
  ],[
    {session_id:"mon",student_id:"one",status:"present"},
    {session_id:"mon",student_id:"two",status:"excused"},
  ],[
    {quiz_id:"quiz",student_id:"one",score:80,released_at:"2026-11-17T09:00:00Z"},
    {quiz_id:"quiz",student_id:"one",score:40,released_at:"2026-11-18T09:00:00Z"},
    {quiz_id:"quiz",student_id:"two",score:99,released_at:null},
  ],new Map([["quiz",100]]),[
    {student_id:"one",enrolled_at:"2026-01-01T00:00:00Z"},
    {student_id:"two",enrolled_at:"2026-01-01T00:00:00Z"},
  ],now);
  assert.equal(signals.length,8);
  const week=signals[7];
  assert.equal(week.sessions,1);
  assert.equal(week.attendance,100);
  assert.equal(week.releasedQuiz,80);
  assert.equal(week.quizSamples,1);
  assert.equal(signals[6].attendance,null);
});

test("late-enrolled learners are not counted absent for sessions before they joined",()=>{
  const now=Date.parse("2026-11-18T12:00:00Z");
  const signals=lib.weeklyAcademicTrends([
    {id:"first",starts_at:"2026-11-16T10:00:00Z",expires_at:"2026-11-16T10:15:00Z",closed_at:null},
  ],[{session_id:"first",student_id:"one",status:"present"}],[],
  new Map(),[
    {student_id:"one",enrolled_at:"2026-01-01T00:00:00Z"},
    {student_id:"late",enrolled_at:"2026-11-17T10:00:00Z"},
  ],now);
  assert.equal(signals[7].attendance,100);
});
