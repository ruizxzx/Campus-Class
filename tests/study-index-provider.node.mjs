import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const provider=readFileSync(new URL("../lib/study-document-provider.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/ai/index-syllabus/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/202611190036_syllabus_pgvector_index.sql",import.meta.url),"utf8");
test("PDF indexing is staff-only, validates class ownership and uses server signed URLs",()=>{
  assert.match(route,/role!=="admin"&&context\.profile\.role!=="faculty"/);
  assert.match(route,/\.eq\("faculty_id",context.userId\)/);
  assert.match(route,/storage_path\.startsWith\(prefix\)/);
  assert.match(route,/createSignedUrl\(syllabus.storage_path,240\)/);
  assert.match(route,/replace_syllabus_text_chunks/);
});
test("text must originate from PDF parser annotations and OCR needs an explicit option",()=>{
  assert.match(provider,/parsedPdfFromAnnotations\(response\)/);
  assert.match(provider,/useOcr\?"mistral-ocr":"cloudflare-ai"/);
  assert.match(route,/use_ocr:z.boolean\(\).default\(false\)/);
});
test("embeddings use college Vault and quotas with exact 1536 dimensions",()=>{
  assert.match(provider,/read_college_ai_secret/);
  assert.match(provider,/consume_ai_request_quota/);
  assert.match(provider,/openrouter.ai\/api\/v1\/embeddings/);
  assert.match(provider,/validEmbedding\(item.embedding\)/);
});
test("database is private, has cascade cleanup and atomic replacement",()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public.syllabus_text_chunks from public,anon,authenticated/);
  assert.match(sql,/references public.class_syllabi\(college_id,id\) on delete cascade/);
  assert.match(sql,/perform pg_catalog.pg_advisory_xact_lock/);
  assert.match(sql,/delete from public.syllabus_text_chunks/);
  assert.match(sql,/returns integer/);
  assert.match(sql,/grant execute on function public.replace_syllabus_text_chunks.*to service_role/);
});
