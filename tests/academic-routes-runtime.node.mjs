import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require=createRequire(import.meta.url);
const ts=require("typescript");

const stageError={code:"PGRST205"};
const jsxs=(type,props)=>({type,props:props??{}});
function findNode(node,type){
  if(!node||typeof node!=="object")return null;
  if(node.type===type)return node;
  const children=node.props?.children;
  for(const child of (Array.isArray(children)?children:[children])){
    const result=findNode(child,type);if(result)return result;
  }
  return null;
}
function fakeDb(errorTable){
  return{
    from(table){
      const query={
        select(){return this;},eq(){return this;},in(){return this;},
        order(){return this;},not(){return this;},range(){return this;},
        limit(){return this;},maybeSingle(){return Promise.resolve(get());},
        then(onFulfilled,onRejected){return Promise.resolve(get()).then(onFulfilled,onRejected);},
      };
      function get(){
        if(table===errorTable)return{data:null,error:stageError};
        if(table==="classes")return{data:[{
          id:"class",subject_id:"subject",display_name:"Class",section:"A",
          subjects:{code:"MTH",name:"Mathematics"},
        }],error:null};
        return{data:[],error:null};
      }
      return query;
    },
  };
}
function getPage(name,{table,throwConfig=false}){
  const source=readFileSync(new URL("../app/(app)/"+name+"/page.tsx",import.meta.url),"utf8");
  const output=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  const exports={};
  const fakeHealth={
    academicLog(){},academicIssueFor:()=> "migration",
    missingOptionalAcademicTable:()=>false,
  };
  const modules={
    "react/jsx-runtime":{jsx:jsxs,jsxs,Fragment:"Fragment"},
    "@/lib/auth":{
      requireProfile:async()=>({id:"admin",role:"admin",college_id:"college"}),
      requireRole:async()=>({id:"admin",role:"admin",college_id:"college"}),
    },
    "@/lib/supabase/admin":{
      createAdminClient:()=>{
        if(throwConfig)throw Error("No server-only Supabase secret");
        return fakeDb(table);
      },
    },
    "@/lib/time":{nowEpochMs:()=>1000},
    "@/components/ui":{PageHeader:"PageHeader"},
    "@/components/localized-page-header":{LocalizedPageHeader:"PageHeader"},
    "@/components/academic-data-state":{AcademicDataState:"AcademicDataState"},
    "@/components/gradebook-grid":{GradebookGrid:"GradebookGrid"},
    "@/components/outcome-dashboard":{OutcomeDashboard:"OutcomeDashboard"},
    "@/components/student-success-dashboard":{StudentSuccessDashboard:"StudentSuccessDashboard"},
    "@/lib/academic-health":fakeHealth,
    "@/lib/student-success":{DEFAULT_SUPPORT_RULES:{},validSupportRules:()=>true,
      summarizeStudent:()=>({}),releasedQuizEvidence:()=>new Map()},
    "@/lib/academic-evidence":{collectEvidence:async()=>({data:[],error:null,truncated:false}),
      bestReleasedQuizScores:()=>new Map(),releasedAssignmentMarks:()=>new Map(),
      emptyEvidence:()=>({data:[],error:null,truncated:false})},
  };
  runInNewContext(output,{exports,console:{error(){}},require(name){
    if(!(name in modules))throw Error("Unexpected dependency "+name);
    return modules[name];
  }});
  return exports.default({searchParams:Promise.resolve({})});
}
test("gradebook renders migration warning when attendance table missing",async()=>{
  const page=await getPage("gradebook",{table:"attendance_sessions"});
  const info=findNode(page,"AcademicDataState");
  assert.ok(info);
  assert.equal(info.props.area,"Gradebook");
  assert.equal(info.props.issue,"migration");
});
test("outcomes renders migration warning when outcomes table missing",async()=>{
  const page=await getPage("outcomes",{table:"course_outcomes"});
  const info=findNode(page,"AcademicDataState");
  assert.ok(info);
  assert.equal(info.props.area,"Outcomes");
  assert.equal(info.props.issue,"migration");
});
test("student success renders migration warning when intervention table missing",async()=>{
  const page=await getPage("success",{table:"student_interventions"});
  const info=findNode(page,"AcademicDataState");
  assert.ok(info);
  assert.equal(info.props.area,"Student Success");
  assert.equal(info.props.issue,"migration");
});
test("all three pages render safe server-configuration state instead of throwing",async()=>{
  for(const name of ["gradebook","outcomes","success"]){
    const page=await getPage(name,{throwConfig:true});
    const info=findNode(page,"AcademicDataState");
    assert.ok(info);
    assert.equal(info.props.issue,"configuration");
  }
});
