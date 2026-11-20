import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("manual lesson endpoint blocks imported YouTube completion before saving progress",()=>{
 const api=read("app/api/lessons/complete/route.ts");
 assert.match(api,/youtube_lesson_sources/);
 assert.ok(api.indexOf("if (youtubeSource)")>0);
 assert.ok(api.indexOf("if (youtubeSource)")<api.indexOf('from("lesson_progress")'));
});
test("certificate issuer also enforces tracked watch evidence",()=>{
 const sql=read("supabase/migrations/202611200049_youtube_certificate_watch_integrity.sql");
 assert.match(sql,/create or replace function private.issue_completed_course_certificate/);
 assert.match(sql,/youtube_watch_progress wp/);
 assert.match(sql,/wp.completed_at is null or wp.percent < coalesce\(r.watched_threshold,90\)/);
});
