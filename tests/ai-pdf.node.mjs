import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const open=readFileSync(new URL("../lib/openrouter.ts",import.meta.url),"utf8");
const study=readFileSync(new URL("../app/api/ai/study-assistant/route.ts",import.meta.url),"utf8");
const resource=readFileSync(new URL("../app/api/ai/resource-assistant/route.ts",import.meta.url),"utf8");
test("private PDFs are accessible only after college/class RLS and prefix verification",()=>{
  assert.match(resource,/createSignedUrl\(data\.storage_path, 180\)/);
  assert.match(resource,/data\.storage_path\.startsWith\(expectedPrefix\)/);
  assert.match(study,/classIds\.includes\(syllabus\.class_id\)/);
  assert.match(study,/createSignedUrl\(syllabus\.storage_path, 180\)/);
});
test("PDFs use documented OpenRouter file-parser and server-generated HTTPS URLs",()=>{
  assert.match(open,/engine: "cloudflare-ai"/);
  assert.match(open,/part\.file\.file_data\.length > 4000/);
  assert.match(resource,/type: "file"/);
  assert.match(study,/type: "file"/);
});
