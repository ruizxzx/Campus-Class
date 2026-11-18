import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=ts.transpileModule(readFileSync(new URL("../lib/openrouter.ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function harness({quota=true,quotaError=null,enabled=true}={}){
  const actions=[];
  const db={
    from(){return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{
      enabled,model:"test/model",api_key_ciphertext:"YQ==",api_key_iv:"YQ==",api_key_tag:"YQ==",
    },error:null})};},
    async rpc(name,params){
      actions.push("quota");
      assert.equal(name,"consume_ai_request_quota");
      assert.equal(params.p_college_id,"college");
      assert.equal(params.p_user_id,"student");
      return{data:quota,error:quotaError};
    },
  };
  const exports={};
  runInNewContext(source,{exports,Buffer,AbortSignal,
    process:{env:{OPENROUTER_ENCRYPTION_KEY:Buffer.alloc(32,1).toString("base64")}},
    console:{error(){}},
    fetch:async()=>{actions.push("provider");return{ok:true,json:async()=>({choices:[{message:{content:"A grounded response"}}]})};},
    require(name){
      if(name==="server-only")return{};
      if(name==="node:crypto")return{
        createDecipheriv:()=>({setAuthTag(){},update(){return Buffer.from("private-test-key");},final(){return Buffer.alloc(0);}}),
      };
      if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
      throw Error("Unexpected import "+name);
    }});
  const profile={college_id:"college",id:"student",role:"student",status:"active"};
  return{actions,complete:()=>exports.completeWithOpenRouter(profile,[{role:"user",content:"Explain my lesson"}],900)};
}
test("valid quota is consumed before calling the paid AI provider",async()=>{
  const api=harness();
  assert.equal(await api.complete(),"A grounded response");
  assert.deepEqual(api.actions,["quota","provider"]);
});
test("hourly AI quota exhaustion fails closed without spending tokens",async()=>{
  const api=harness({quota:false});
  await assert.rejects(api.complete(),error=>error.status===429);
  assert.deepEqual(api.actions,["quota"]);
});
test("missing AI quota migration blocks the paid request",async()=>{
  const api=harness({quotaError:{code:"PGRST202"}});
  await assert.rejects(api.complete(),error=>error.status===503&&/migration/.test(error.message));
  assert.deepEqual(api.actions,["quota"]);
});
test("disabled college AI does not consume provider quota",async()=>{
  const api=harness({enabled:false});
  await assert.rejects(api.complete(),error=>error.status===503);
  assert.deepEqual(api.actions,[]);
});
