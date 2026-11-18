import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/ai/study-assistant/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/academic-planning.tsx",import.meta.url),"utf8");
test("Copilot embeds questions only when a private syllabus index exists",()=>{
  assert.match(route,/\.from\("syllabus_text_chunks"\)/);
  assert.match(route,/\.eq\("college_id",context.profile.college_id\)/);
  assert.match(route,/embedStudyText\(context.profile,\[parsed.data.question\]\)/);
  assert.match(route,/match_syllabus_text_chunks/);
  assert.match(route,/classIds.includes\(item.class_id\)/);
  assert.match(route,/indexedReferences/);
});
test("PDF indexing is staff-initiated with clear paid OCR choice and feedback",()=>{
  assert.match(ui,/canManage&&<button type="button"/);
  assert.match(ui,/Index \/ re-index PDF/);
  assert.match(ui,/Use paid OCR for scanned PDFs/);
  assert.match(ui,/indexingId!==null/);
});
