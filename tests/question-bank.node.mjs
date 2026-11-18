import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/question-bank/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/202611180033_question_bank.sql",import.meta.url),"utf8");
test("bank answers are only available from authenticated staff routes",()=>{
  assert.match(route,/staffContext/);
  assert.match(route,/role!=="faculty"&&context\.profile\.role!=="admin"/);
  assert.match(route,/allowedSubjects/);
  assert.match(route,/created_by/);
});
test("question bank is service-only and scoped by college and subject",()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.question_bank_items from public,anon,authenticated/);
  assert.match(sql,/foreign key \(college_id,subject_id\)/);
  assert.match(route,/\.eq\("college_id",context\.profile\.college_id\)/);
});
