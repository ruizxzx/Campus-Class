import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCopilotPractice } from "../lib/copilot-practice.ts";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Copilot parses existing question/answer-key format without exposing it before submission", () => {
  const text = Array.from({length: 5}, (_,i) => `Q${i+1}. What is concept ${i+1}? [S${i+1}]
A) Choice one
B) Choice two
C) Choice three
D) Choice four`).join("\n\n") + "\nAnswer Key: 1-B, 2-B, 3-B, 4-A, 5-C";
  const quiz = parseCopilotPractice(text);
  assert.ok(quiz);
  assert.equal(quiz.length, 5);
  assert.deepEqual(quiz.map(q => q.answer), [1,1,1,0,2]);
  assert.deepEqual(quiz[0].sourceIds, ["S1"]);
  const ui=read("components/ai-study-assistant.tsx");
  assert.match(ui, /submittedQuiz/);
  assert.match(ui, /Check answers/);
  assert.match(ui, /practiceQuestions/);
});
test("Copilot refuses incomplete or unkeyed practice questions rather than exposing answer key", () => {
  assert.equal(parseCopilotPractice("Q1: Some question\nA) a\nB) b\nC) c\nD) d"), null);
});
test("revision fallback and general explanations remain separate from workspace citations", () => {
  const api = read("app/api/ai/study-assistant/route.ts");
  assert.match(api, /buildRevisionFallback/);
  assert.match(api, /General knowledge/);
  assert.match(api, /Never attach workspace citations to general knowledge/);
  assert.match(api, /parseCopilotPractice/);
});
test("library indexing is triggered after upload, and AI preview label requires indexed_at", () => {
  const upload=read("components/study-library-upload.tsx");
  const library=read("app/(app)/library/page.tsx");
  assert.match(upload,/action:"index"/);
  assert.match(library,/indexed_at/);
  assert.match(library,/AI ready/);
});
test("resource syllabus question requests real PDF citations", () => {
  const api = read("app/api/ai/resource-assistant/route.ts");
  assert.match(api,/syllabus_text_chunks/);
  assert.match(api,/\[S1\]/);
});
