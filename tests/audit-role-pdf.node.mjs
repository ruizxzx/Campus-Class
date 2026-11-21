import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
function load(path,mocks={}){const exports={};const src=readFileSync(new URL("../"+path,import.meta.url),"utf8");runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,TextEncoder,Uint8Array,require:name=>name in mocks?mocks[name]:require(name)});return exports;}
for(const path of ["app/api/courses/publish/route.ts","app/api/admin/academic-management/route.ts"]){
 test(path+" rejects student mutations before querying the database",async()=>{const mod=load(path,{"next/server":{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}},"@/lib/http":{requestProfile:async()=>({profile:{role:"student"},userId:"student"}),isResponse:()=>false},"@/lib/supabase/admin":{createAdminClient(){throw new Error("Unexpected privileged query");}}});const response=await mod.POST({json(){throw new Error("Unexpected request parsing");}});assert.equal(response.status,403);});
}
test("certificate PDF cross-reference points at every object",()=>{const {jpegPdf}=load("lib/certificates/jpeg-pdf.ts");const pdf=Buffer.from(jpegPdf(Uint8Array.from([255,216,255,217]),1684,1190));const str=pdf.toString("latin1");assert.ok(str.startsWith("%PDF-1.4"));const start=Number(str.match(/startxref\n(\d+)/)[1]);assert.equal(str.slice(start,start+4),"xref");const rows=str.slice(start).split("\n").slice(3,8);for(let i=0;i<5;i++)assert.ok(str.slice(Number(rows[i].slice(0,10))).startsWith((i+1)+" 0 obj"));});
