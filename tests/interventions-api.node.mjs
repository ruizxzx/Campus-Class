import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=ts.transpileModule(readFileSync(new URL("../app/api/success/interventions/route.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function harness({role="faculty",assigned=true,enrolled=true}={}){
  const calls=[];
  const db={from(table){
    let next=null;
    return{
      select(){return this;},eq(){return this;},
      maybeSingle:async()=>{
        calls.push("lookup:"+table);
        if(table==="student_interventions")return{data:{id:"intervention",class_id:"class"},error:null};
        if(table==="classes")return{data:{id:"class"},error:null};
        if(table==="class_faculty")return{data:assigned?{faculty_id:"faculty"}:null,error:null};
        if(table==="class_enrollments")return{data:enrolled?{id:"enrollment"}:null,error:null};
        return{data:null,error:null};
      },
      insert:async(data)=>{calls.push({table,insert:data});return{error:null};},
      update(changes){next=changes;return this;},
      then(resolve,reject){
        calls.push({table,update:next});
        return Promise.resolve({error:null}).then(resolve,reject);
      },
    };
  }};
  const type={uuid(){return this;},min(){return this;},max(){return this;},trim(){return this;},
    regex(){return this;},optional(){return this;},nullable(){return this;}};
  const exports={};
  runInNewContext(source,{exports,Date,console:{error(){}},require(name){
    if(name==="next/server")return{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
    if(name==="zod")return{z:{string:()=>type,literal:()=>type,enum:()=>type,object:()=>type,
      discriminatedUnion:()=>({safeParse:(data)=>({success:true,data})})}};
    if(name==="@/lib/http")return{requestProfile:async()=>({userId:"faculty",profile:{role,college_id:"college"}}),isResponse:()=>false};
    if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
    throw Error("Unexpected import "+name);
  }});
  return{calls,post:body=>exports.POST({json:async()=>body})};
}
test("assigned faculty can persist intervention action plan and follow-up date",async()=>{
  const api=harness();
  const response=await api.post({action:"create",class_id:"class",student_id:"student",
    reason:"attendance",note:"Missed recent attendance",action_plan:"Arrange tutoring",
    follow_up_at:"2026-12-01"});
  assert.equal(response.status,200);
  const added=api.calls.find(x=>typeof x==="object"&&x.insert);
  assert.equal(added.insert.action_plan,"Arrange tutoring");
  assert.equal(added.insert.follow_up_at,"2026-12-01");
});
test("staff may record outcome and resolve assigned-class follow-up",async()=>{
  const api=harness();
  const response=await api.post({action:"update",id:"intervention",status:"resolved",outcome_note:"Student attended support meeting"});
  assert.equal(response.status,200);
  const changed=api.calls.find(x=>typeof x==="object"&&x.update);
  assert.equal(changed.update.status,"resolved");
  assert.ok(changed.update.resolved_at);
  assert.equal(changed.update.outcome_note,"Student attended support meeting");
});
test("unassigned faculty cannot see or mutate another class intervention",async()=>{
  const api=harness({assigned:false});
  const result=await api.post({action:"update",id:"intervention",status:"resolved"});
  assert.equal(result.status,403);
  assert.equal(api.calls.some(x=>typeof x==="object"&&x.update),false);
});
test("students cannot create staff-only intervention plans",async()=>{
  const api=harness({role:"student"});
  const result=await api.post({action:"create",class_id:"class",student_id:"student",reason:"support",note:"Notes"});
  assert.equal(result.status,403);
  assert.deepEqual(api.calls,[]);
});
