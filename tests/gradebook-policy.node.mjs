import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
const source=readFileSync(new URL("../lib/gradebook-policy.ts",import.meta.url),"utf8");
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={};runInNewContext(transpiled,{exports:mod,Math,Object,Number});
const config={assignment_weight:30,project_weight:20,quiz_weight:40,attendance_weight:10};
test("gradebook weighted index uses explicit configured category weights",()=>{
  const value=mod.weightedRecordedIndex({
    scores:[50,80,60],attendance:100,
  },[{type:"assignment",maxMarks:100},{type:"project",maxMarks:100},{type:"quiz",maxMarks:100}],config);
  assert.equal(value,66);
});
test("missing scores and absent attendance are excluded rather than counted as zero",()=>{
  const value=mod.weightedRecordedIndex({
    scores:[null,80,null],attendance:null,
  },[{type:"assignment",maxMarks:100},{type:"project",maxMarks:100},{type:"quiz",maxMarks:100}],config);
  assert.equal(value,80);
});
test("invalid rules and marks fail closed; absent policy is never silently official",()=>{
  assert.equal(mod.validGradeWeights({...config,quiz_weight:99}),false);
  assert.equal(mod.weightedRecordedIndex({scores:[80],attendance:null},[{type:"quiz",maxMarks:100}],
    {...config,quiz_weight:99}),null);
  assert.equal(mod.weightedRecordedIndex({scores:[120],attendance:null},[{type:"quiz",maxMarks:100}],config),null);
  assert.equal(mod.validGradeWeights({...config,quiz_weight:40.001}),false);
});
test("policy is a per-class service-only table enforced by server staff permissions",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/202611180034_class_gradebook_policies.sql",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/gradebook/policy/route.ts",import.meta.url),"utf8");
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public.class_gradebook_policies from public,anon,authenticated/);
  assert.match(route,/can_manage_assignments/);
  assert.match(route,/eq\("college_id",collegeId\)/);
});
