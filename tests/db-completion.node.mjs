import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("pgTAP completion suite plan matches the number of non-destructive assertions",()=>{
  const sql=readFileSync(new URL("../supabase/tests/campusclass_20_completion.test.sql",import.meta.url),"utf8");
  const plan=Number(sql.match(/select plan\((\d+)\)/)?.[1]);
  assert.equal(plan,(sql.match(/select ok\(/g)??[]).length);
  assert.match(sql,/begin;/);
  assert.match(sql,/rollback;/);
  assert.match(sql,/p_expected_updated_at/);
  assert.doesNotMatch(sql,/\btruncate\b/i);
  assert.doesNotMatch(sql,/delete from public\./i);
});
