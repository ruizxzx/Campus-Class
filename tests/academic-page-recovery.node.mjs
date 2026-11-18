import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const diag=readFileSync(new URL("../lib/academic-health.ts",import.meta.url),"utf8");
const source=ts.transpileModule(diag,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={};runInNewContext(source,{exports:mod,Set,console:{error(){}}});
test("missing tables/columns have a deployment diagnosis, not an empty grade",()=>{
  for(const code of ["42P01","42703","PGRST205","PGRST204","PGRST202"])
    assert.equal(mod.academicIssueFor({code}),"migration");
  assert.equal(mod.academicIssueFor({code:"42501"}),"permissions");
  assert.equal(mod.academicIssueFor({code:"PGRST301"}),"unavailable");
  assert.equal(mod.missingOptionalAcademicTable({code:"PGRST116"}),false);
});
test("all three academic route modules handle query problems as visible UI",()=>{
  for(const module of ["gradebook","outcomes","success"]){
    const body=readFileSync(new URL("../app/(app)/"+module+"/page.tsx",import.meta.url),"utf8");
    assert.match(body,/AcademicDataState/);
    assert.match(body,/academicLog/);
    assert.match(body,/try\s*\{db=createAdminClient\(\)/);
    assert.doesNotMatch(body,/throw new Error\(/);
  }
});
test("gradebook avoids empty-id in() requests for classes with zero students",()=>{
  const body=readFileSync(new URL("../app/(app)/gradebook/page.tsx",import.meta.url),"utf8");
  assert.match(body,/ids.length \? collectEvidence/);
  assert.match(body,/emptyEvidence</);
});
test("admin-only health page is read-only, service-only and never fetches AI secret",()=>{
  const body=readFileSync(new URL("../app/(app)/admin/academic-health/page.tsx",import.meta.url),"utf8");
  assert.match(body,/requireRole\(\["admin"\]\)/);
  assert.match(body,/createAdminClient\(\)/);
  assert.match(body,/head:true/);
  assert.doesNotMatch(body,/decrypted_secret|api_key_ciphertext|read_college_ai_secret/);
});
