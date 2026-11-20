import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../"+p, import.meta.url),"utf8");
test("bulk endpoint authorizes college admin and derives the college from session",()=>{
 const api=read("app/api/admin/bulk-accounts/route.ts");
 assert.match(api,/requestProfile\(/);
 assert.match(api,/ctx\.profile\.role !== "admin"/);
 assert.match(api,/collegeId=ctx\.profile\.college_id/);
 assert.match(api,/idempotency_key/);
 assert.match(api,/count\?\?0\)>=10/);
});
test("import jobs are bounded, idempotent, and backed by real Auth users",()=>{
 const validator=read("lib/bulk-accounts.ts");
 const provision=read("lib/member-provisioning.ts");
 assert.match(validator,/\.max\(150\)/);
 assert.match(validator,/Duplicate email in batch/);
 assert.match(validator,/createHmac/);
 assert.match(provision,/auth\.admin\.createUser/);
 assert.match(provision,/auth\.admin\.deleteUser/);
 assert.match(provision,/activity_logs/);
});
test("worker and queue cannot be invoked by arbitrary browsers",()=>{
 const sql=read("supabase/migrations/202611210051_bulk_member_accounts.sql");
 const api=read("app/api/admin/bulk-accounts/process/route.ts");
 const cron=read("app/api/cron/bulk-accounts/route.ts");
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/revoke all on function public\.claim_bulk_account_rows_for_batch/);
 assert.match(sql,/grant execute on function public\.claim_bulk_account_rows_for_batch.*to service_role/);
 assert.match(api,/ctx\.profile\.role!=="admin"/);
 assert.match(api,/\.eq\("college_id",ctx\.profile\.college_id\)/);
 assert.match(cron,/timingSafeEqual/);
});
test("Hobby deployments do not contain an unsupported per-minute cron",()=>{
 const json=JSON.parse(read("vercel.json"));
 assert.equal(json.crons.some(c=>c.path==="/api/cron/bulk-accounts"),false);
});
