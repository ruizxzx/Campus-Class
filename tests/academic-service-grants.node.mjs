import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/202611190037_academic_service_read_grants.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/(app)/admin/academic-health/page.tsx",import.meta.url),"utf8");
const state=readFileSync(new URL("../components/academic-data-state.tsx",import.meta.url),"utf8");

test("037 repairs the reported SELECT 42501 root cause with no data write or RLS bypass",()=>{
  for(const table of ["classes","subjects","quizzes","quiz_attempts",
    "profiles","assignments","assignment_submissions","assignment_evaluations",
    "class_faculty","class_enrollments","attendance_sessions","attendance_records",
    "student_interventions","course_outcomes","outcome_assessments",
    "class_gradebook_policies","student_success_rules"]){
    assert.ok(sql.includes("'"+table+"'"),table+" is not included");
  }
  assert.match(sql,/grant select on table public\.%I to service_role/);
  assert.match(sql,/grant usage on schema public to service_role/);
  assert.doesNotMatch(sql,/grant .* to (?:anon|authenticated)\b/i);
  assert.doesNotMatch(sql,/alter table[^;]+disable row level security/i);
  assert.doesNotMatch(sql,/drop table|truncate|delete from/i);
  assert.match(sql,/to_regclass\(/);
});

test("admin diagnostics checks the previously missing tables and links the repair",()=>{
  for(const table of ['table:"classes"','table:"subjects"','table:"quizzes"','table:"quiz_attempts"'])
    assert.ok(page.includes(table),table);
  assert.match(page,/202611190037_academic_service_read_grants.sql/);
});

test("faculty can see exact remediation without exposing any database secret",()=>{
  assert.match(state,/SQL patch 037/);
  assert.match(state,/college administrator/);
  assert.doesNotMatch(state,/api_key|SUPABASE_SERVICE_ROLE_KEY/);
});
