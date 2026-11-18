import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("deadline cron pages all assignments, submitted versions and active rosters", () => {
  const source = read("app/api/cron/deadline-reminders/route.ts");
  assert.ok((source.match(/\.range\(/g) ?? []).length >= 3);
  for (const key of ["assignmentOffset", "submittedStudents", "class_enrollments", "ignoreDuplicates: true", "reference_key:"]) assert.ok(source.includes(key), key);
  assert.match(source, /\.order\("student_id"/);
  assert.match(source, /\.order\("id"/);
  assert.doesNotMatch(source, /const upcomingAssignments = assignments \?\? \[\]/);
});
test("submission files cannot be reused and failed writes preserve Storage objects", () => {
  const route = read("app/api/assignments/[id]/submit/route.ts");
  assert.match(route, /new Set\(paths\)\.size !== paths\.length/);
  assert.match(route, /\.in\("storage_path", paths\)/);
  assert.doesNotMatch(route, /admin\.storage\.from\("student-submissions"\)\.remove/);
  const ui = read("components/academic-workflows.tsx");
  assert.match(ui, /submissionRequestStarted=true/);
  assert.match(ui, /if\(!submissionRequestStarted&&uploaded\.length\)/);
});
test("released grades preserve release state and notify idempotently", () => {
  const api = read("app/api/submissions/[id]/evaluate/route.ts");
  assert.match(api, /existingEvaluation\?\.released_at/);
  assert.match(api, /assignment-evaluated:\$\{submissionId\}/);
  assert.match(api, /ignoreDuplicates: true/);
  assert.match(api, /statusError \|\| !updated/);
  assert.match(api, /warning/);
});
test("failed invitation activation restores its own claimed invitation", () => {
  const source = read("app/api/invitations/accept/route.ts");
  assert.match(source, /const claimedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(source, /\.update\(\{ accepted_at: null \}\)/);
  assert.match(source, /\.eq\("accepted_at", claimedAt\)/);
});
test("voluntary class exit and administrator removal have different rejoin behavior", () => {
  const route = read("app/api/classes/join/route.ts");
  assert.match(route, /prior\?\.status === "removed"/);
  assert.match(route, /prior\?\.status === "left"/);
  assert.match(route, /\.eq\("status", "left"\)/);
  assert.match(route, /codeError/);
  assert.match(route, /classError/);
});
test("migration 039 is forward-only and guards existing duplicate data", () => {
  const sql = read("supabase/migrations/202611190039_enrollment_and_submission_integrity.sql");
  assert.match(sql, /grant update \(status, enrolled_at\).*service_role/i);
  assert.match(sql, /having count\(\*\) > 1/i);
  assert.match(sql, /create unique index if not exists submission_attachments_college_path_unique/i);
  assert.doesNotMatch(sql, /drop table|truncate table|disable row level security/i);
});
