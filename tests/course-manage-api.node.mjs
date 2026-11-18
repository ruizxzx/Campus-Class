import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=ts.transpileModule(
  readFileSync(new URL("../app/api/courses/manage/route.ts",import.meta.url),"utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText;

const revision="2026-11-18T13:00:00.000Z";
function harness({role="faculty",error=null,courseId="course"}={}){
  const calls=[];
  const db={
    rpc:async(name,params)=>{
      calls.push({name,params});
      return{data:courseId,error};
    },
    from(table){
      assert.equal(table,"activity_logs");
      return{insert:async(payload)=>{calls.push({name:"audit",params:payload});return{error:null};}};
    },
  };
  // Only the runtime authorization/DB contract is mocked; the real Zod schema
  // is separately typechecked during CI and the DB RPC must be tested on staging.
  const chain=new Proxy({},{
    get(_target,property){
      if(property==="safeParse")return(value)=>({success:true,data:value});
      return()=>chain;
    },
  });
  const z=new Proxy({},{
    get(_target,property){
      if(property==="discriminatedUnion")return()=>({
        safeParse:(value)=>({success:true,data:value}),
      });
      return()=>chain;
    },
  });
  const exports={};
  runInNewContext(source,{
    exports,
    console:{error(){}},
    JSON,Number,
    require(name){
      if(name==="next/server")return{NextResponse:{
        json:(body,options)=>({body,status:options?.status??200}),
      }};
      if(name==="zod")return{z};
      if(name==="@/lib/http")return{
        requestProfile:async()=>({userId:"staff-1",profile:{role,college_id:"college-1"}}),
        isResponse:()=>false,
      };
      if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
      throw Error("Unexpected dependency "+name);
    },
  });
  const curriculum={action:"update",course_id:"course",subject_id:"subject",
    revision,title:"Updated lesson course",description:"A real curriculum",
    publish:true,modules:[{id:"old-module",title:"Module One",
      lessons:[{id:"old-lesson",title:"Lecture One",plain_text:"Course notes",
        video_url:null,is_published:true}]}],
  };
  return{calls,send:(body=curriculum)=>exports.POST({
    text:async()=>JSON.stringify(body),
  })};
}
test("transactional course API allows active staff and passes the expected revision",async()=>{
  const api=harness();
  const result=await api.send();
  assert.equal(result.status,200);
  assert.equal(result.body.id,"course");
  const rpc=api.calls.find((item)=>item.name==="save_course_curriculum");
  assert.ok(rpc);
  assert.equal(rpc.params.p_college_id,"college-1");
  assert.equal(rpc.params.p_actor_id,"staff-1");
  assert.equal(rpc.params.p_expected_updated_at,revision);
  assert.equal(rpc.params.p_modules[0].lessons[0].id,"old-lesson");
});
test("students cannot use staff-only curriculum RPC",async()=>{
  const api=harness({role:"student"});
  assert.equal((await api.send()).status,403);
  assert.equal(api.calls.length,0);
});
test("stale curriculum revision is rejected instead of overwriting edits",async()=>{
  const api=harness({error:{code:"40001"}});
  const result=await api.send();
  assert.equal(result.status,409);
  assert.match(result.body.error,/changed elsewhere/);
  assert.equal(api.calls.some((item)=>item.name==="audit"),false);
});
test("missing manual course SQL migration fails with a helpful error",async()=>{
  const api=harness({error:{code:"PGRST202"}});
  const result=await api.send();
  assert.equal(result.status,503);
  assert.match(result.body.error,/migration 036/);
});
test("staff cannot mutate an unassigned college course",async()=>{
  const api=harness({error:{code:"42501"}});
  const result=await api.send();
  assert.equal(result.status,403);
  assert.equal(api.calls.some((item)=>item.name==="audit"),false);
});
