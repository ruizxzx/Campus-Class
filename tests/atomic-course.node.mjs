import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/202611180036_atomic_course_curriculum.sql",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/courses/manage/route.ts",import.meta.url),"utf8");

test("staff curriculum changes are atomic and non-destructive",()=>{
  assert.match(sql,/create or replace function public.save_course_curriculum/);
  assert.match(sql,/for update/);
  assert.match(sql,/p_expected_updated_at is distinct from v_current_updated_at/);
  assert.match(route,/error.code==="40001"/);
  assert.match(sql,/student progress/);
  assert.match(sql,/raise exception 'Existing chapters\/lectures cannot be omitted/);
  assert.doesNotMatch(sql,/delete from public.course_lessons/i);
  assert.doesNotMatch(sql,/delete from public.lesson_progress/i);
});
test("only trusted server service role may execute transactional course mutation",()=>{
  assert.match(sql,/revoke all on function public.save_course_curriculum[\s\S]*from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public.save_course_curriculum[\s\S]*to service_role/);
  assert.match(sql,/where p.id=p_actor_id and p.college_id=p_college_id/);
  assert.match(sql,/cf.college_id=p_college_id and cf.faculty_id=p_actor_id/);
  assert.match(route,/context.profile.role!=="admin" && context.profile.role!=="faculty"/);
  assert.match(route,/db.rpc\("save_course_curriculum"/);
});
