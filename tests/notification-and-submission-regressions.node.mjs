import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("migration 038 grants trusted service-role notification and stream writes", () => {
  const sql = read("supabase/migrations/202611190038_notifications_and_stream_service_grants.sql");
  for (const statement of [
    /grant select, insert on table public\.notifications to service_role/i,
    /grant select on table public\.announcements to service_role/i,
    /grant select, insert, update, delete on table public\.class_stream_posts to service_role/i,
    /grant select, insert, delete on table public\.stream_targets to service_role/i,
    /grant select, insert, delete on table public\.stream_attachments to service_role/i,
  ]) assert.match(sql, statement);
  assert.doesNotMatch(sql, /drop table|truncate table|disable row level security/i);
});
test("notifiers page through the full roster and retries deduplicate", () => {
  for (const url of ["app/api/assignments/[id]/notify/route.ts", "app/api/announcements/[id]/notify/route.ts"]) {
    const code = read(url);
    assert.match(code, /\.range\(offset, offset \+ batchSize - 1\)/);
    assert.match(code, /ignoreDuplicates: true/);
    assert.match(code, /reference_key:/);
  }
});
test("failed notices do not roll back published assignments", () => {
  const ui = read("components/academic-workflows.tsx");
  assert.match(ui, /notification network\/database error/);
  assert.match(ui, /Retry student notifications/);
  assert.match(ui, /notificationsSent=false/);
});
test("student submission edit checks enrollment, deadline, and latest version", () => {
  const api = read("app/api/submissions/[id]/route.ts");
  assert.match(api, /class_enrollments/);
  assert.match(api, /assignment\.allow_late/);
  assert.match(api, /\.gt\("version", submission\.version\)/);
});

test("assignment publication happens only after reference files are recorded", () => {
  const ui = read("components/academic-workflows.tsx");
  const draft = ui.indexOf('status:"draft",published_at:null');
  const metadata = ui.indexOf('.from("assignment_attachments").insert(');
  const published = ui.indexOf('.update({status:"published",published_at:');
  assert.ok(draft >= 0 && metadata > draft && published > metadata);
  assert.match(ui, /if\(!publicationCommitted\)/);
});
