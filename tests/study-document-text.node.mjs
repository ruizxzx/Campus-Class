import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
const source=readFileSync(new URL("../lib/study-document-text.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const m={};runInNewContext(js,{exports:m,Array,Number});
const parsed=(texts)=>m.parsedPdfFromAnnotations({choices:[{message:{annotations:[{
  type:"file",file:{hash:"aabbccddeeff00112233445566778899",content:texts.map((text)=>({type:"text",text}))}
}]}}]});
test("only annotated PDF parser text is indexed, not an AI summary",()=>{
  const input={choices:[{message:{content:"An unrelated hallucinated summary",annotations:[{
    type:"file",file:{hash:"aabbccddeeff0011",content:[
      {type:"text",text:"Verbatim material from the provided PDF document's first section."},
      {type:"image_url",image_url:{url:"data:image/png;base64,secret"}},
    ]},
  }]}}]};
  const value=m.parsedPdfFromAnnotations(input);
  assert.match(value.text,/Verbatim material/);
  assert.doesNotMatch(value.text,/hallucinated|secret/);
  const chunks=m.chunkExtractedPdf(value);
  assert.equal(chunks[0].page,null);
});
test("real form-feed boundaries generate page-aware chunk references",()=>{
  const doc=parsed(["First page contains source text with a useful complete concept.\fSecond page contains a different concept and citation context."]);
  const chunks=m.chunkExtractedPdf(doc);
  assert.equal(doc.pageBoundaries,true);
  assert.deepEqual(chunks.map((item)=>item.page),[1,2]);
});
test("scanned/empty or oversized PDFs fail instead of inventing content",()=>{
  assert.throws(()=>parsed([""]),/too little/);
  assert.throws(()=>m.parsedPdfFromAnnotations({choices:[{message:{content:"model reply"}}]}),/No verified PDF/);
  assert.throws(()=>parsed(["x".repeat(120001)]),/too large/);
});
test("chunker keeps content bounded and rejects extremely long PDFs before partial insert",()=>{
  const doc=parsed(["Source text ".repeat(1000)]);
  const chunks=m.chunkExtractedPdf(doc);
  assert.ok(chunks.length>1);
  assert.ok(chunks.every((item)=>item.content.length<=1800));
  assert.equal(chunks.map((item)=>item.content).join("").replaceAll(" ",""),
    doc.text.replaceAll(" ",""));
});
test("OpenRouter embeddings must have exact finite 1536 dimensions",()=>{
  assert.equal(m.validEmbedding(Array(1536).fill(0.1)),true);
  assert.equal(m.validEmbedding(Array(1535).fill(0.1)),false);
  assert.equal(m.validEmbedding([...Array(1535).fill(0),Number.NaN]),false);
});
