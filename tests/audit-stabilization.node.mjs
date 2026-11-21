import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latestSubmissions, assignmentState, awaitingRelease } from "../lib/assignment-work-state.ts";

test("late and resubmitted work is completed once, using latest version",()=>{
 const submissions=latestSubmissions([{assignment_id:"a",status:"evaluated",version:2},{assignment_id:"a",status:"late",version:1},{assignment_id:"b",status:"late",version:1}]);
 assert.equal(submissions.size,2);
 assert.equal(submissions.get("a").status,"evaluated");
 assert.equal(assignmentState({id:"b",due_at:"2026-10-01T00:00:00Z"},submissions,Date.parse("2026-11-21T00:00:00Z")),"completed");
});
test("unsubmitted work is assigned or missing based on deadline",()=>{
 const now=Date.parse("2026-11-21T00:00:00Z");
 assert.equal(assignmentState({id:"a",due_at:null},new Map(),now),"assigned");
 assert.equal(assignmentState({id:"a",due_at:"2026-11-22T00:00:00Z"},new Map(),now),"assigned");
 assert.equal(assignmentState({id:"a",due_at:"2026-11-20T00:00:00Z"},new Map(),now),"missing");
 assert.equal(awaitingRelease(6,4),2);
 assert.equal(awaitingRelease(2,3),0);
});
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("manual course publication uses one restricted database transaction",()=>{
 const sql=read("supabase/migrations/202611210052_atomic_manual_course_publish.sql");
 assert.match(sql,/security invoker/i);
 assert.match(sql,/class_faculty/);
 assert.match(sql,/p_actor_id/);
 assert.match(sql,/revoke all[^;]+from public,anon,authenticated/i);
 assert.match(sql,/grant execute[^;]+to service_role/i);
 assert.match(sql,/insert into public\.courses[\s\S]+insert into public\.course_modules[\s\S]+insert into public\.course_lessons[\s\S]+update public\.courses/);
 assert.doesNotMatch(sql,/\b(drop table|truncate|delete from|disable row level security)\b/i);
});
test("quiz session patch grants server-only column-specific row-lock privilege",()=>{
 const sql=read("supabase/migrations/202611210053_quiz_session_row_lock_grant.sql");
 assert.match(sql,/grant update \(status\) on table public\.quizzes to service_role/i);
 assert.doesNotMatch(sql,/grant[^;]+to (authenticated|anon|public)\b/i);
});
test("faculty progress preserves lesson IDs and titles together",()=>{
 const page=read("app/(app)/faculty/progress/page.tsx");
 assert.match(page,/lessons\.push\(\{id:item\.id,title:item\.title\}\)/);
 assert.doesNotMatch(page,/lessons\.push\(item\.id\)/);
});
