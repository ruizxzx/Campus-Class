import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const doc=readFileSync(new URL("../docs/CAMPUSCLASS_2_0_COMPLETION.md",import.meta.url),"utf8");
test("deploy guide lists all forward migrations and mandatory AI re-key action",()=>{
  for(const number of ["032","033","034","035"]) assert.match(doc,new RegExp(number+": "));
  assert.match(doc,/re-enter/i);
  assert.match(doc,/OpenRouter API key/i);
  assert.match(doc,/No live Supabase/);
});
