import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ai = readFileSync(new URL("../lib/openrouter.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/ai-settings/route.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/202611180032_college_ai_vault.sql", import.meta.url), "utf8");

test("college AI routes save new secrets to a service-only Vault RPC, not a browser variable", () => {
  assert.match(route, /admin\.rpc\("set_college_ai_secret"/);
  assert.doesNotMatch(route, /encryptOpenRouterKey\(/);
  assert.match(ai, /admin\.rpc\("read_college_ai_secret"/);
  assert.match(sql, /revoke all on function public\.read_college_ai_secret[\s\S]*from public,anon,authenticated;/);
  assert.match(sql, /grant execute on function public\.read_college_ai_secret[\s\S]*to service_role;/);
});
test("legacy keys remain accessible only when the original key exists", () => {
  assert.match(ai, /settings\.api_key_vault_id/);
  assert.match(ai, /legacy encryption and its server key is missing/);
  assert.match(route, /needs_rekey:/);
});
test("Vault migration preserves legacy key rows until admin re-saves", () => {
  assert.match(sql, /alter table public\.college_ai_settings add column if not exists api_key_vault_id/);
  assert.match(sql, /on conflict \(college_id\) do update set/);
  assert.doesNotMatch(sql, /delete from public\.college_ai_settings/);
});
