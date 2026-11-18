import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/success/rules/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/202611180035_student_success_rules.sql",import.meta.url),"utf8");
test("only college administrators can change support indicator thresholds",()=>{
  assert.match(route,/context\.profile\.role!=="admin"/);
  assert.match(route,/validSupportRules/);
  assert.match(route,/college_id:context\.profile\.college_id/);
});
test("support rule storage is college-scoped and service-only",()=>{
  assert.match(sql,/primary key references public\.colleges/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.student_success_rules from public,anon,authenticated/);
});
