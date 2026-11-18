import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/attendance/route.ts",import.meta.url),"utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const validToken = "valid-attendance-code-value";
const tokenHash = createHash("sha256").update(validToken).digest("hex");

function harness({role="student",assigned=true,enrolled=true,closed=false,expired=false,duplicate=false}={}) {
  const calls=[];
  const session={id:"attendance-session",class_id:"class-1",college_id:"college-1",token_hash:tokenHash,
    closed_at:closed?"2026-01-01":null,
    starts_at:new Date(Date.now()-60000).toISOString(),
    expires_at:new Date(Date.now()+(expired?-1000:300000)).toISOString()};
  const db={from(table){
    let operation="select";
    const builder={
      select(){return this;},eq(){return this;},is(){return this;},gt(){return this;},
      async maybeSingle(){
        calls.push("lookup:"+table);
        if(table==="attendance_sessions")return{data:session,error:null};
        if(table==="classes")return{data:{id:"class-1"},error:null};
        if(table==="class_faculty")return{data:assigned?{faculty_id:"staff"}:null,error:null};
        if(table==="class_enrollments")return{data:enrolled?{id:"enrollment"}:null,error:null};
        return{data:null,error:null};
      },
      async insert(data){
        calls.push("insert:"+table);
        if(table==="attendance_records"){
          assert.equal(data.student_id,"student");
          return{error:duplicate?{code:"23505"}:null};
        }
        return{data:{id:"new-session",title:data.title,expires_at:data.expires_at},error:null};
      },
      single(){return Promise.resolve({data:{id:"new-session",title:"Lecture",expires_at:session.expires_at},error:null});},
      update(){operation="update";return this;},
      upsert(){calls.push("upsert:"+table);return Promise.resolve({error:null});},
      then(ok,bad){calls.push(operation+":"+table);return Promise.resolve({error:null}).then(ok,bad);},
    };return builder;
  }};
  const zType={min(){return this;},max(){return this;},int(){return this;},uuid(){return this;}};
  const exports={};
  runInNewContext(compiled,{exports,Buffer,Date,URL,console:{error(){}},require(name){
    if(name==="node:crypto")return require("node:crypto");
    if(name==="next/server")return {NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}};
    if(name==="zod")return {z:{string:()=>zType,number:()=>zType,literal:()=>zType,
      enum:()=>zType,object:()=>zType,discriminatedUnion:()=>({safeParse:data=>({success:true,data})})}};
    if(name==="@/lib/http")return {requestProfile:async()=>({userId:role==="student"?"student":"staff",profile:{role,college_id:"college-1"}}),isResponse:()=>false};
    if(name==="@/lib/supabase/admin")return {createAdminClient:()=>db};
    if(name==="@/lib/qr/svg")return {attendanceQrSvg:()=>"<svg/>"};
    throw Error("Unexpected module "+name);
  }});
  return {calls,post:data=>exports.POST({url:"https://campusclass.example/api/attendance",json:async()=>data})};
}
test("invalid QR token cannot create attendance",async()=>{
  const api=harness(),result=await api.post({action:"checkin",session_id:"session",token:"incorrect-token"});
  assert.equal(result.status,403);assert.equal(api.calls.includes("insert:attendance_records"),false);
});
test("expired and closed QR attendance is rejected",async()=>{
  for(const opts of [{expired:true},{closed:true}]){
    const api=harness(opts),result=await api.post({action:"checkin",session_id:"session",token:validToken});
    assert.equal(result.status,409);assert.equal(api.calls.includes("insert:attendance_records"),false);
  }
});
test("unenrolled student cannot check in",async()=>{
  const api=harness({enrolled:false}),result=await api.post({action:"checkin",session_id:"session",token:validToken});
  assert.equal(result.status,403);assert.equal(api.calls.includes("insert:attendance_records"),false);
});
test("duplicate attendance check-in is idempotent",async()=>{
  const api=harness({duplicate:true}),result=await api.post({action:"checkin",session_id:"session",token:validToken});
  assert.equal(result.status,200);assert.equal(result.body.alreadyCheckedIn,true);
});
test("faculty not assigned to class cannot generate QR",async()=>{
  const api=harness({role:"faculty",assigned:false}),result=await api.post({action:"create",class_id:"class-1",title:"Lecture",minutes:5});
  assert.equal(result.status,403);assert.equal(api.calls.includes("insert:attendance_sessions"),false);
});
