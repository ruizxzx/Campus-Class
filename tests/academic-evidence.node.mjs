import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../lib/academic-evidence.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};runInNewContext(output,{exports:api,Map,Set,Number});
test("unreleased results never enter official gradebook or attainment",()=>{
  const marks=api.releasedAssignmentMarks([
    {id:"old",assignment_id:"a",student_id:"s",version:1},
    {id:"new",assignment_id:"a",student_id:"s",version:2}],
    [{submission_id:"old",marks:100,released_at:"2026-01-01"},
     {submission_id:"new",marks:20,released_at:null}]);
  assert.equal(marks.size,0);
  const quizzes=api.bestReleasedQuizScores([
    {quiz_id:"q",student_id:"s",score:90,released_at:null},
    {quiz_id:"q",student_id:"s",score:60,released_at:"2026-01-01"},
    {quiz_id:"q",student_id:"s",score:70,released_at:"2026-01-01"}]);
  assert.equal(quizzes.size,1);
  assert.equal(quizzes.get("q:s"),70);
});
test("pagination returns all rows instead of silently treating the first page as complete",async()=>{
  const ids=["a","b"];let calls=0;
  const data=await api.collectEvidence(ids,async(batch,from,to)=>{
    calls++;
    if(from===0&&batch[0]==="a")return{data:Array.from({length:1000},(_,i)=>i),error:null};
    if(from===1000)return{data:[1000],error:null};
    return{data:[2000],error:null};
  });
  assert.equal(data.truncated,false);
  assert.equal(data.data.length,1002);
  assert.equal(calls,3);
});
