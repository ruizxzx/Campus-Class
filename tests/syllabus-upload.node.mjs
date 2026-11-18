import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeSource = readFileSync(new URL("../app/api/syllabi/route.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function buildApi({ insertError = null, uploadError = null, permission = true } = {}) {
  const actions = [];
  const admin = {
    from(table) {
      const builder = {
        select() { return this; }, eq() { return this; },
        async maybeSingle() {
          actions.push(`lookup:${table}`);
          if (table === "classes") return { data: { id: "class-1" }, error: null };
          if (table === "class_faculty") return { data: permission ? { faculty_id: "faculty-1" } : null, error: null };
          return { data: null, error: null };
        },
        async insert(data) {
          actions.push(`insert:${table}`);
          if (table === "class_syllabi") {
            assert.equal(data.created_by, "faculty-1");
            return { error: insertError };
          }
          return { error: null };
        },
      };
      return builder;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "class-syllabi");
        return {
          async upload() { actions.push("storage:upload"); return { error: uploadError }; },
          async remove() { actions.push("storage:remove"); return { error: null }; },
        };
      },
    },
  };
  const exports = {};
  runInNewContext(transpiled, { exports, Buffer, crypto: webcrypto, console: { error() {} }, require(name) {
    if (name === "next/server") return { NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body }) } };
    if (name === "@/lib/http") return {
      requestProfile: async () => ({ userId: "faculty-1", profile: { role: "faculty", college_id: "college-1" } }),
      isResponse: () => false,
    };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => admin };
    if (name === "@/lib/validators") return { syllabusUploadSchema: { safeParse: (data) => ({ success: true, data }) } };
    if (name === "@/lib/upload-validation") return { hasExpectedFileSignature: () => true };
    throw new Error(`Unexpected import ${name}`);
  } });
  return {
    actions,
    async post() {
      return exports.POST({ async formData() { return new Map([
        ["class_id", "97a00000-0000-4000-8000-000000000001"],
        ["title", "Year 1 syllabus"], ["outline_text", "Week 1"],
        ["file", new File(["%PDF-1.7"], "syllabus.pdf", { type: "application/pdf" })],
      ]); } });
    },
  };
}

test("assigned faculty syllabus metadata is saved after storage upload", async () => {
  const api = buildApi();
  const response = await api.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(api.actions.slice(0, 4), ["lookup:classes", "lookup:class_faculty", "storage:upload", "insert:class_syllabi"]);
  assert.equal(api.actions.includes("storage:remove"), false);
});

test("missing service role insert grant reports actionable error and cleans up uploaded PDF", async () => {
  const api = buildApi({ insertError: { code: "42501", message: "permission denied for table class_syllabi" } });
  const response = await api.post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /syllabus service-role access migration/);
  assert.equal(api.actions.includes("storage:remove"), true);
});

test("foreign key mismatch reports faculty-class relationship issue", async () => {
  const api = buildApi({ insertError: { code: "23503", message: "foreign key violation" } });
  const response = await api.post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /class or faculty profile/);
  assert.equal(api.actions.includes("storage:remove"), true);
});

test("unassigned faculty cannot write to storage or syllabus table", async () => {
  const api = buildApi({ permission: false });
  const response = await api.post();
  assert.equal(response.status, 403);
  assert.deepEqual(api.actions, ["lookup:classes", "lookup:class_faculty"]);
});

test("missing syllabus table produces a specific migration error", async () => {
  const api = buildApi({ insertError: { code: "PGRST205", message: "not in schema cache" } });
  const response = await api.post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /syllabus table is missing/);
  assert.equal(api.actions.includes("storage:remove"), true);
});
