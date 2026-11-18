import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
}
const adminSource=transpile("../app/api/admin/ai-settings/route.ts");
const aiSource=transpile("../lib/openrouter.ts");
const secret="sk-or-v1-test-key-do-not-use-12345";

function adminHarness({role="admin",existing=null,vaultError=null}={}) {
  const calls=[];
  const settingsTable={
    select(){return this;},eq(){return this;},
    maybeSingle:async()=>({data:existing,error:null}),
    upsert:async(data)=>{calls.push(["upsert",data]);return{error:null};},
  };
  const db={
    from(table){
      if(table==="college_ai_settings")return settingsTable;
      if(table==="activity_logs")return{insert:async()=>({error:null})};
      throw Error("Unexpected table "+table);
    },
    rpc:async(name,args)=>{calls.push(["rpc",name,args]);return{error:vaultError};},
  };
  const exports={};
  runInNewContext(adminSource,{
    exports,process:{env:{SUPABASE_SERVICE_ROLE_KEY:"valid-server-secret",
      NEXT_PUBLIC_SUPABASE_URL:"https://test.supabase.co"}},
    console:{error(){}},
    require(name) {
      if(name==="next/server")return{NextResponse:{json:(body,options)=>({status:options?.status??200,body})}};
      if(name==="@/lib/http")return{
        requestProfile:async()=>({userId:"admin",profile:{role,college_id:"college"}}),
        isResponse:(value)=>typeof value?.status==="number",
      };
      if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
      if(name==="@/lib/validators")return{collegeAISettingsSchema:{
        safeParse:(data)=>({success:!!data&&typeof data==="object",data}),
      }};
      throw Error("Unexpected module "+name);
    },
  });
  const input={enabled:true,model:"openai/gpt-4o-mini",api_key:secret};
  return{
    calls,
    get:()=>exports.GET(),
    put:(body=input)=>exports.PUT({json:async()=>body}),
  };
}

test("admin saves configured college API key with NO app encryption environment variable",async()=>{
  const api=adminHarness();
  const result=await api.put();
  assert.equal(result.status,200);
  assert.equal(result.body.configured,true);
  assert.equal(result.body.needs_rekey,false);
  assert.equal(Object.values(result.body).includes(secret),false);
  assert.equal(api.calls.filter(([action])=>action==="upsert").length,0);
  const record=api.calls.find(([action])=>action==="rpc");
  assert.equal(record?.[1],"set_college_ai_secret");
  assert.equal(record?.[2].p_secret,secret);
  assert.equal(record?.[2].p_college_id,"college");
});
test("missing Vault SQL is diagnosed explicitly instead of reporting master key missing",async()=>{
  const api=adminHarness({vaultError:{code:"PGRST202"}});
  const result=await api.put();
  assert.equal(result.status,503);
  assert.match(result.body.error,/Vault migration/);
});
test("admin sees legacy re-key warning; existing encrypted key is not silently deleted",async()=>{
  const current={enabled:true,model:"test/model",api_key_vault_id:null,
    api_key_ciphertext:"cipher",api_key_iv:"iv",api_key_tag:"tag"};
  const api=adminHarness({existing:current});
  const status=await api.get();
  assert.equal(status.status,200);
  assert.equal(status.body.configured,true);
  assert.equal(status.body.needs_rekey,true);
  assert.equal("api_key_ciphertext" in status.body,false);
  const response=await api.put({enabled:false,model:"test/model",api_key:""});
  assert.equal(response.status,200);
  const saved=api.calls.find(([action])=>action==="upsert")?.[1];
  assert.equal(saved.api_key_ciphertext,"cipher");
  assert.equal(saved.api_key_tag,"tag");
});
test("student cannot inspect or change AI settings",async()=>{
  const api=adminHarness({role:"student"});
  assert.equal((await api.get()).status,403);
  assert.equal((await api.put()).status,403);
  assert.equal(api.calls.length,0);
});

function aiHarness({vaultKey=secret,vaultError=null}={}) {
  const calls=[];
  const db={
    from(name){
      assert.equal(name,"college_ai_settings");
      return{
        select(){return this;},eq(){return this;},
        maybeSingle:async()=>({data:{enabled:true,model:"test/model",
          api_key_vault_id:"vault-uuid",api_key_ciphertext:null,
          api_key_iv:null,api_key_tag:null},error:null}),
      };
    },
    rpc:async(name,params)=>{
      calls.push([name,params]);
      return name==="consume_ai_request_quota"
        ?{data:true,error:null}
        :{data:vaultKey,error:vaultError};
    },
  };
  const exports={};
  runInNewContext(aiSource,{
    exports,Buffer,AbortSignal,process:{env:{}},console:{error(){}},
    fetch:async(_url,options)=>{
      calls.push(["fetch",options.headers.Authorization]);
      return {ok:true,json:async()=>({choices:[{message:{content:"Study explanation"}}]})};
    },
    require(name){
      if(name==="server-only")return{};
      if(name==="node:crypto")return{
        createCipheriv(){throw Error("Legacy cipher must not run")},
        createDecipheriv(){throw Error("Legacy decipher must not run")},
        randomBytes(){throw Error("Legacy random generator must not run")},
      };
      if(name==="@/lib/supabase/admin")return{createAdminClient:()=>db};
      throw Error("Unexpected import "+name);
    },
  });
  return{calls,complete:()=>exports.completeWithOpenRouter({
    college_id:"college",id:"student",role:"student",status:"active",
  },[{role:"user",content:"Explain my syllabus"}],900)};
}
test("student uses saved Vault key without OPENROUTER_ENCRYPTION_KEY",async()=>{
  const ai=aiHarness();
  const result=await ai.complete();
  assert.equal(result,"Study explanation");
  assert.deepEqual(ai.calls.map((item)=>item[0]),[
    "consume_ai_request_quota","read_college_ai_secret","fetch",
  ]);
  assert.equal(ai.calls[2][1],"Bearer "+secret);
});
test("missing Vault migration/secret fails safely before contacting provider",async()=>{
  const ai=aiHarness({vaultError:{code:"PGRST202"}});
  await assert.rejects(ai.complete(),(error)=>error.status===503&&/Vault SQL/.test(error.message));
  assert.equal(ai.calls.some((item)=>item[0]==="fetch"),false);
});
