import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeYoutubeSync } from "../lib/youtube-sync.ts";
import { describeYoutubeApplyError } from "../lib/youtube-apply-error.ts";
import {
 parsePlaylistUrl,parseIsoDuration,fetchPlaylistMeta,fetchPlaylistPage,YouTubeApiError,
} from "../lib/youtube-data.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("strict playlist URL validation blocks invalid and non-YouTube hosts",()=>{
 assert.equal(parsePlaylistUrl("https://www.youtube.com/playlist?list=PL123456789012"),"PL123456789012");
 assert.equal(parsePlaylistUrl("https://youtu.be/ABCDEFGHIJK?list=PL123456789012"),"PL123456789012");
 for(const url of ["https://youtube.com.evil.com/playlist?list=PL123456789012",
   "http://youtube.com/playlist?list=PL123456789012",
   "https://youtube.com/evil?list=PL123456789012",
   "javascript:alert(1)","https://youtube.com/playlist?list=foo"]){
   assert.throws(()=>parsePlaylistUrl(url),YouTubeApiError);
 }
});
test("ISO 8601 video durations preserve hours, minutes, days, seconds",()=>{
 assert.equal(parseIsoDuration("PT1H04M05S"),3845);
 assert.equal(parseIsoDuration("PT15M"),900);
 assert.equal(parseIsoDuration("P1DT1M"),86460);
 assert.equal(parseIsoDuration("garbage"),0);
});
test("official YouTube Data API pagination and metadata handle inaccessible videos",async()=>{
 const originalFetch=globalThis.fetch,originalKey=process.env.YOUTUBE_DATA_API_KEY;
 process.env.YOUTUBE_DATA_API_KEY="test_only_dummy_youtube_api_key";
 const requests=[];
 globalThis.fetch=async input=>{
   const url=new URL(String(input));
   assert.equal(url.host,"www.googleapis.com");
   assert.equal(url.searchParams.get("key"),"test_only_dummy_youtube_api_key");
   requests.push({path:url.pathname,token:url.searchParams.get("pageToken")});
   const json=url.pathname.endsWith("/playlists")?
     {items:[{snippet:{title:"Study Playlist",description:"Lecture series",
       thumbnails:{medium:{url:"https://i.ytimg.com/fake"}}},contentDetails:{itemCount:2}}]}:
       url.pathname.endsWith("/playlistItems")?{
         items:[
           {snippet:{position:0,title:"First",resourceId:{videoId:"AAAAAAAAAAA"}}},
           {snippet:{position:1,title:"Deleted video",resourceId:{videoId:"BBBBBBBBBBB"}}},
         ],nextPageToken:"page-2",pageInfo:{totalResults:3},
       }:{items:[{id:"AAAAAAAAAAA",snippet:{title:"Algorithms",description:"Sorting"},
         contentDetails:{duration:"PT10M30S"},status:{privacyStatus:"public",embeddable:true}}]};
   return new Response(JSON.stringify(json),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
   const meta=await fetchPlaylistMeta("PL123456789012");
   assert.equal(meta.count,2);
   const page=await fetchPlaylistPage("PL123456789012",null);
   assert.equal(page.nextPageToken,"page-2");
   assert.equal(page.videos.length,2);
   assert.equal(page.videos[0].durationSeconds,630);
   assert.equal(page.videos[0].availability,"available");
   assert.equal(page.videos[1].availability,"deleted");
   assert.deepEqual(page.videos.map(v=>v.position),[0,1]);
   assert.equal(requests.filter(x=>x.path.endsWith("/videos")).length,1);
 }finally{globalThis.fetch=originalFetch;
   if(originalKey===undefined)delete process.env.YOUTUBE_DATA_API_KEY;
   else process.env.YOUTUBE_DATA_API_KEY=originalKey;
 }
});
test("API quota exhaustion returns an actionable error without exposing the key",async()=>{
 const originalFetch=globalThis.fetch,originalKey=process.env.YOUTUBE_DATA_API_KEY;
 process.env.YOUTUBE_DATA_API_KEY="test_only_dummy_youtube_api_key";
 globalThis.fetch=async()=>new Response(JSON.stringify({
   error:{code:403,errors:[{reason:"quotaExceeded"}]},
 }),{status:403});
 try{
   await assert.rejects(()=>fetchPlaylistMeta("PL123456789012"),error=>
     error instanceof YouTubeApiError&&error.status===429&&
       !error.message.includes("test_only_dummy"));
 }finally{globalThis.fetch=originalFetch;
   if(originalKey===undefined)delete process.env.YOUTUBE_DATA_API_KEY;
   else process.env.YOUTUBE_DATA_API_KEY=originalKey;
 }
});
test("job storage is durable, idempotent and worker locked",()=>{
 const sql=read("supabase/migrations/202611190045_youtube_playlists_schema.sql");
 const rpc=read("supabase/migrations/202611190046_youtube_import_atomic_functions.sql");
 for(const token of ["idempotency_key","next_page_token","youtube_import_items",
   "youtube_playlist_sources","youtube_lesson_sources","enable row level security"])
   assert.ok(sql.includes(token),token);
 assert.match(rpc,/for update skip locked/i);
 assert.match(rpc,/pg_advisory_xact_lock/i);
 assert.match(rpc,/on conflict\(college_id,course_id,playlist_id\)/i);
 assert.match(rpc,/status='applied'/i);
 assert.doesNotMatch(sql,/disable row level security|truncate table/i);
});
test("watch progress blocks seeking to end and merges only watched ranges",()=>{
 const sql=read("supabase/migrations/202611190047_youtube_watch_certificates.sql");
 assert.match(sql,/int4multirange/);
 assert.match(sql,/v_session.last_state=1/);
 assert.match(sql,/v_movement<=v_elapsed/);
 assert.match(sql,/unnest\(v_coverage\)/);
 assert.match(sql,/on conflict\(lesson_id,student_id\) do nothing/);
 assert.match(sql,/recheck_youtube_certificate/);
 assert.match(sql,/required_quiz_id/);
 assert.match(sql,/required_assignment_id/);
});
test("server-only YouTube credentials and enforced role/class checks",()=>{
 const data=read("lib/youtube-data.ts");
 const access=read("lib/youtube-access.ts");
 const api=read("app/api/youtube/imports/route.ts");
 assert.match(data,/process.env.YOUTUBE_DATA_API_KEY/);
 assert.doesNotMatch(data,/NEXT_PUBLIC_YOUTUBE/);
 assert.match(access,/class_faculty/);
 assert.match(access,/subject_id/);
 assert.match(api,/requestProfile/);
 assert.match(api,/canManageYoutubeSubject/);
});
test("student IFrame API player persists server-authenticated playback",()=>{
 const player=read("components/youtube-tracked-player.tsx");
 const route=read("app/api/youtube/watch/route.ts");
 assert.match(player,/www.youtube.com\/iframe_api/);
 assert.match(player,/getCurrentTime/);
 assert.match(player,/getPlaybackRate/);
 assert.match(player,/heartbeat/);
 assert.match(route,/class_enrollments/);
 assert.match(route,/record_youtube_watch/);
});
test("playlist synchronization preserves historical lessons and certificates",()=>{
 const apply=read("supabase/migrations/202611190046_youtube_import_atomic_functions.sql");
 assert.match(apply,/not exists\(/);
 assert.match(apply,/removed_from_playlist_at/);
 assert.doesNotMatch(apply,/delete from public.lesson_progress|delete from public.academic_certificates/i);
 const cron=read("app/api/cron/youtube-imports/route.ts");
 assert.match(cron,/timingSafeEqual/);
 assert.match(cron,/processQueuedYoutubeJobs/);
});
test("course wizard preserves manual authoring and import alternatives",()=>{
 const studio=read("components/faculty-learning-studio.tsx");
 assert.match(studio,/Create manually/);
 assert.match(studio,/Import YouTube playlists/);
 assert.match(studio,/YoutubeImportWizard/);
 const wizard=read("components/youtube-import-wizard.tsx");
 for(const token of ["Select all new videos","Deselect all","Suggest chapters with AI",
  "Publish complete course","Create course draft","Retry","Sync"])assert.match(wizard,new RegExp(token,"i"));
});

test("playlist sync compares the entire imported snapshot, not only page one",()=>{
 const existing=[{video_id:"A",playlist_position:0},{video_id:"B",playlist_position:120},
   {video_id:"REMOVED",playlist_position:150}];
 const snapshot=Array.from({length:151},(_,i)=>({
   video_id:i===0?"A":i===120?"B":"NEW-"+i,playlist_position:i+1,
 }));
 assert.deepEqual(summarizeYoutubeSync(existing,snapshot),{
   missing:1,added:149,reordered:2,
 });
 // Duplicate appearances of a video ID never inflate additions.
 assert.deepEqual(summarizeYoutubeSync([],[
   {video_id:"A",playlist_position:0},{video_id:"A",playlist_position:1},
   {video_id:null,playlist_position:2},
 ]),{missing:0,added:1,reordered:0});
});
test("failed playlist jobs are explicitly retried and completion notification is idempotent",()=>{
 const wizard=read("components/youtube-import-wizard.tsx");
 const player=read("components/youtube-tracked-player.tsx");
 const api=read("app/api/youtube/imports/[id]/route.ts");
 const worker=read("lib/youtube-worker.ts");
 assert.match(wizard,/status==="failed"\|\|status==="cancelled"\?"retry":"process"/);
 assert.match(player,/completedNotified=true/);
 assert.match(player,/completedNotified=Boolean\(result.completed\)/);
 assert.match(api,/summarizeYoutubeSync\(existing,fresh\)/);
 assert.match(worker,/course\?\.status!=="active"/);
});

test("YouTube course publishing migration grants service-role course writes without changing RLS",()=>{
 const sql=read("supabase/migrations/202611190048_youtube_course_publish_service_grants.sql");
 for(const table of ["courses","course_modules","course_lessons"]){
   assert.match(sql,new RegExp("grant select, insert, update on table public\\."+table+" to service_role","i"));
 }
 assert.match(sql,/has_function_privilege\(/);
 assert.doesNotMatch(sql,/disable row level security|drop policy|delete from|truncate table/i);
});
test("YouTube publish failures explain missing SQL 048 without exposing PostgreSQL details",()=>{
 assert.deepEqual(describeYoutubeApplyError({code:"42501",message:"permission denied for table courses"}),{
   message:"Course publishing is blocked by database permissions. Ask the college administrator to run forward SQL 048, then retry this saved import.",
   status:503,reason:"permission_denied_table_courses",
 });
 assert.equal(describeYoutubeApplyError({code:"42501",message:"Import job owner mismatch"}).status,403);
 assert.equal(describeYoutubeApplyError({code:"42501",message:"Target course is not in the imported subject"}).status,403);
 const unknown=describeYoutubeApplyError({code:"XX000",message:"private student data should not appear"});
 assert.doesNotMatch(unknown.message,/private student data/);
});
