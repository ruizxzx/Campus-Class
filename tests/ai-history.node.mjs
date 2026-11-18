import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/ai/study-history/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/202611180037_ai_study_history.sql",import.meta.url),"utf8");
const study=readFileSync(new URL("../app/api/ai/study-assistant/route.ts",import.meta.url),"utf8");
test("AI history is private to the authenticated student and the college",()=>{
  assert.match(route,/context.profile.role!=="student"/);
  assert.match(route,/\.eq\("college_id",context.profile.college_id\)/);
  assert.match(route,/\.eq\("student_id",context.userId\)/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public.ai_study_exchanges from public,anon,authenticated/);
});
test("history is bounded and per-request idempotent without storing API keys",()=>{
  assert.match(route,/\.limit\(50\)/);
  assert.match(sql,/unique\(college_id,student_id,request_id\)/);
  assert.doesNotMatch(sql,/api_key_ciphertext|decrypted_secret/);
});
