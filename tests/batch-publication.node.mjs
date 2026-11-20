import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("multi-PDF syllabus publisher validates files before one atomic upsert",()=>{
 const api=read("app/api/syllabi/batch/route.ts");
 assert.match(api,/\.upsert\(rows,\{onConflict:"id",ignoreDuplicates:true\}\)/);
 assert.ok(api.indexOf("upsert(rows")>api.indexOf("for(const file of body.items)"));
});
test("library multi-file publishing uses authorized transactional RPC",()=>{
 const api=read("app/api/library/materials/route.ts");
 const sql=read("supabase/migrations/202611200050_atomic_library_publication.sql");
 assert.match(api,/publish_study_material_batch/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/for update/);
 assert.match(sql,/revoke all on function public.publish_study_material_batch/);
});
