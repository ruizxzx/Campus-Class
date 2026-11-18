import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=ts.transpileModule(readFileSync(new URL("../app/api/syllabi/route.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

function harness({databaseError=null,storageError=null,assigned=true}={}){
  const steps=[];
  const db={
    from(table){
      let mutation=false;
      return{
        select(){return this;},eq(){return this;},
        delete(){mutation=true;return this;},
        maybeSingle:async()=>{
          steps.push("read:"+table);
          if(table==="class_syllabi")return {data:{id:"syllabus",class_id:"class",storage_path:"college/class/syllabus.pdf"},error:null};
          if(table==="class_faculty")return {data:assigned?{faculty_id:"faculty"}:null,error:null};
          return {data:null,error:null};
        },
        then(resolve,reject){
          if(mutation){steps.push("delete:"+table);return Promise.resolve({error:databaseError}).then(resolve,reject);}
          return Promise.resolve({error:null}).then(resolve,reject);
        }
      };
    },
    storage:{from(){return{remove:async()=>{steps.push("remove:storage");return {error:storageError};}};}}
  };
  const exports={};
  runInNewContext(source,{exports,console:{error(){}},require(name){
    if(name==="next/server")return{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
    if(name==="@/lib/http")return{requestProfile:async()=>({userId:"faculty",profile:{role:"faculty",college_id:"college"}}),isResponse:()=>false};
    if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
    if(name==="@/lib/validators")return{syllabusUploadSchema:{}};
    if(name==="@/lib/upload-validation")return{hasExpectedFileSignature:()=>true};
    throw Error("Unexpected import "+name);
  }});
  return{steps,delete:()=>exports.DELETE({json:async()=>({id:"c7d3ed0d-51bd-4b94-981b-c1ed7f3f1423"})})};
}
test("syllabus metadata is deleted before its stored PDF",async()=>{
  const api=harness();
  const result=await api.delete();
  assert.equal(result.status,200);
  assert.deepEqual(api.steps,["read:class_syllabi","read:class_faculty","delete:class_syllabi","remove:storage"]);
});
test("database delete failure preserves syllabus PDF",async()=>{
  const api=harness({databaseError:{code:"42501"}});
  const result=await api.delete();
  assert.equal(result.status,503);
  assert.equal(api.steps.includes("remove:storage"),false);
});
test("a storage cleanup error is returned as a follow-up warning, not a broken DB record",async()=>{
  const api=harness({storageError:{status:503}});
  const result=await api.delete();
  assert.equal(result.status,200);
  assert.equal(result.body.storageCleanupPending,true);
});
test("unassigned faculty cannot delete other class syllabi",async()=>{
  const api=harness({assigned:false});
  const result=await api.delete();
  assert.equal(result.status,403);
  assert.equal(api.steps.some(x=>x.startsWith("delete:")),false);
});
