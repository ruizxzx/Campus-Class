import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const compiled=ts.transpileModule(read("app/api/quizzes/session/route.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const quizId="00000000-0000-4000-8000-000000000008";
const session={id:"session",draft_answers:{},started_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+600000).toISOString(),updated_at:new Date().toISOString()};
function harness({stage="",code="42501",role="student",enrolled=true,existing=false}={}){
 const operations=[],logs=[],exports={};
 let reads=0;
 const failure={data:null,count:null,error:{code,message:"Private database detail must not leave server",details:"Server-only detail",hint:"Server-only hint"}};
 const success={error:null};
 const db={from(table){
  let op="read";
  const q={select(){return this},eq(){return this},gt(){return this},
   insert(){op="insert";return this},update(){op="update";return this},
   maybeSingle(){return Promise.resolve(result())},
   then(ok,bad){return Promise.resolve(result()).then(ok,bad)}};
  function result(){
   let name,data;
   if(table==="quizzes"){name="load quiz";data={id:quizId,class_id:"class",status:"published",opens_at:null,closes_at:null,duration_minutes:10,attempts_allowed:1};}
   else if(table==="class_enrollments"){name="verify quiz enrollment";data=enrolled?{id:"enrollment"}:null;}
   else if(table==="quiz_attempts"){name="count quiz attempts";operations.push(name);return stage===name?failure:{...success,count:0};}
   else if(table==="quiz_attempt_sessions"&&op==="insert"){name="insert quiz attempt session";data=null;}
   else if(table==="quiz_attempt_sessions"&&op==="update"){name="save quiz attempt draft";data={id:session.id};}
   else if(table==="quiz_attempt_sessions"){name=reads++?"reload quiz attempt session after insert":"load quiz attempt session";data=existing||reads>1?session:null;}
   else throw Error("Unexpected query "+table);
   operations.push(name);return stage===name?failure:{...success,data};
  }
  return q;
 }};
 runInNewContext(compiled,{exports,console:{error(...args){logs.push(args)}},Date,require(name){
  if(name==="next/server")return{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}};
  if(name==="@/lib/http")return{requestProfile:async()=>({profile:{role,college_id:"college"},userId:"student"}),isResponse:()=>false};
  if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
  return require(name);
 }});
 return{operations,logs,post:action=>exports.POST({json:async()=>({action,quiz_id:quizId,...(action==="save"?{answers:{}}:{})})})};
}
for(const stage of ["load quiz","verify quiz enrollment","count quiz attempts","load quiz attempt session","insert quiz attempt session","reload quiz attempt session after insert","save quiz attempt draft"]){
 test("database 42501 identifies "+stage,async()=>{
  const isSave=stage==="save quiz attempt draft";
  const h=harness({stage,existing:isSave});
  const r=await h.post(isSave?"save":"start");
  assert.equal(r.status,503);assert.equal(r.body.operation,stage);assert.equal(r.body.code,"42501");
  assert.ok(r.body.error.includes(stage)&&r.body.error.includes("42501"));
  assert.doesNotMatch(r.body.error,/Private database detail/);
 });
}
test("duplicate concurrent start returns the stored session and original timer",async()=>{
 const h=harness({stage:"insert quiz attempt session",code:"23505"});const r=await h.post("start");
 assert.equal(r.status,200);assert.equal(r.body.expiresAt,session.expires_at);
 assert.equal(h.operations.filter(x=>x==="insert quiz attempt session").length,1);
});
test("existing session reload never resets the clock",async()=>{
 const h=harness({existing:true});const r=await h.post("start");
 assert.equal(r.status,200);assert.equal(r.body.expiresAt,session.expires_at);assert.ok(!h.operations.includes("insert quiz attempt session"));
});
test("non-students and unenrolled students still cannot start sessions",async()=>{
 const denied=harness({role:"faculty"});assert.equal((await denied.post("start")).status,403);assert.equal(denied.operations.length,0);
 const unenrolled=harness({enrolled:false});assert.equal((await unenrolled.post("start")).status,403);assert.ok(!unenrolled.operations.includes("insert quiz attempt session"));
});
test("055 only replaces unsupported quiz answer key count and preserves locked legacy RPC",()=>{
 const original=read("supabase/migrations/202611170007_learning_collaboration_hardening.sql").match(/create or replace function public\.submit_quiz_attempt\(_quiz_id uuid, _answers jsonb\)[\s\S]*?\n\$\$;/)[0];
 const migration=read("supabase/migrations/202611210055_quiz_submission_jsonb_key_count.sql");
 const patched=migration.match(/create or replace function public\.submit_quiz_attempt\(_quiz_id uuid, _answers jsonb\)[\s\S]*?\n\$\$;/)[0];
 assert.equal(patched,original.replace("  v_attempt_count integer;","  v_attempt_count integer;\n  v_answer_count integer;").replace("  if jsonb_object_length(_answers) = 0 then","  select count(*) into v_answer_count from pg_catalog.jsonb_object_keys(_answers);\n  if v_answer_count = 0 then").replace("jsonb_object_length(_answers) > 500","v_answer_count > 500"));
 assert.match(migration,/revoke all on function public\.submit_quiz_attempt\(uuid,jsonb\) from public,anon,authenticated/);
 assert.doesNotMatch(migration,/grant execute/i);
});
test("assignment creation requires actual caller as created_by; managers retain class access for RETURNING",()=>{
 const insert=read("supabase/migrations/202611170008_assignment_publishing_rls_repair.sql");
 const returning=read("supabase/migrations/202611170009_assignment_returning_select_grant.sql");
 assert.match(insert,/college_id = \(select private\.current_college_id\(\)\)\s+and created_by = \(select auth\.uid\(\)\)\s+and private\.can_manage_class\(class_id\)/);
 assert.match(insert,/cf\.faculty_id = \(select auth\.uid\(\)\)\s+and cf\.can_manage_assignments/);
 assert.match(returning,/private\.can_access_assignment\(id\)\s+or private\.can_manage_class\(class_id\)/);
});


test("underlying Postgres message, detail and hint remain server-only",async()=>{
 const h=harness({stage:"insert quiz attempt session"});
 const r=await h.post("start");
 assert.equal(r.status,503);
 assert.equal(h.logs.length,1);
 const [label,log]=h.logs[0];
 assert.equal(label,"Quiz session database operation failed");
 assert.equal(log.operation,"insert quiz attempt session");
 assert.equal(log.code,"42501");
 assert.equal(log.message,"Private database detail must not leave server");
 assert.equal(log.detail,"Server-only detail");
 assert.equal(log.hint,"Server-only hint");
 assert.doesNotMatch(JSON.stringify(r.body),/Private database detail|Server-only detail|Server-only hint/);
});
test("056 preserves the complete manual grading RPC, changing only JSONB key counting",()=>{
 const pattern=/create or replace function public\.grade_quiz_attempt\([\s\S]*?\n\$\$;/;
 const before=read("supabase/migrations/202611180016_build_13_learning_workflows.sql").match(pattern)[0];
 const sql=read("supabase/migrations/202611210056_manual_quiz_grading_jsonb_key_count.sql");
 const after=sql.match(pattern)[0];
 assert.equal(after,before.replace("  v_manual_question_count integer;","  v_manual_question_count integer;\\n  v_submitted_score_count integer;").replace("  if jsonb_object_length(_question_scores) <> v_manual_question_count then","  select count(*) into v_submitted_score_count from pg_catalog.jsonb_object_keys(_question_scores);\\n  if v_submitted_score_count <> v_manual_question_count then").replaceAll("\\n","\n"));
 assert.match(sql,/revoke all on function public\.grade_quiz_attempt\(uuid,jsonb,text,boolean\) from public,anon/);
});
test("057 retains every 029 guard and stays security invoker",()=>{
 const original=read("supabase/migrations/202611180029_attendance_quiz_database_integrity.sql").match(/create or replace function private\.guard_quiz_attempt_session\(\)[\s\S]*?\n\$\$;/)[0];
 const candidate=read("supabase/diagnostics/gated_migrations/202611210057_restore_quiz_session_guard.sql");
 assert.ok(candidate.includes(original));
 assert.match(candidate,/live guard already matches 029; do not apply/);
 assert.match(candidate,/security invoker/i);
 assert.doesNotMatch(candidate,/security definer/i);
});
test("conditional RLS and grant candidates require their catalog gates and never run as regular migrations",()=>{
 const dir="supabase/diagnostics/gated_migrations/";
 const mode=read(dir+"202611210058_restore_quiz_session_rls_mode.sql");
 assert.match(mode,/c\.relrowsecurity and c\.relforcerowsecurity and r\.rolname='service_role'/);
 assert.match(mode,/not r\.rolbypassrls and not r\.rolsuper/);
 assert.doesNotMatch(mode,/disable row level security/i);
 assert.match(read(dir+"202611210059_restore_quiz_session_insert_grant.sql"),/grant insert on table public\.quiz_attempt_sessions to service_role/);
 const policy=read(dir+"202611210062_restore_assignment_returning_policy_009.sql");
 assert.match(policy,/exact known 001 predecessor/);
 assert.match(policy,/private\.can_access_assignment\(id\) or private\.can_manage_class\(class_id\)/);
});
