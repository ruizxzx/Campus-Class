import test from "node:test";
import assert from "node:assert/strict";
import { orderQuestions } from "../lib/quiz-order.ts";
const questions = Array.from({length:16},(_,i)=>({id:"question-"+i,prompt:"Question "+i}));
test("shuffle is stable across tab reloads for a student and attempt",()=>{
  const a=orderQuestions(questions,true,"quiz:student:1");
  const b=orderQuestions(questions,true,"quiz:student:1");
  assert.deepEqual(a,b);
  assert.equal(new Set(a.map(x=>x.id)).size,questions.length);
});
test("shuffle keeps a copy and preserves authored order when disabled",()=>{
  const untouched=questions.slice();
  assert.deepEqual(orderQuestions(questions,false,"seed"),questions);
  assert.deepEqual(questions,untouched);
});
test("other students or attempts receive different deterministic ordering",()=>{
  const first=orderQuestions(questions,true,"quiz:studentA:1").map(x=>x.id).join();
  const second=orderQuestions(questions,true,"quiz:studentB:2").map(x=>x.id).join();
  assert.notEqual(first,second);
});
