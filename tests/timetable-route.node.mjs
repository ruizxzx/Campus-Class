import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../app/api/schedules/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ role = 'faculty', canManage = true, classError = null, assignmentError = null, insertError = null, deleteError = null, missingEntry = false, overlaps = [], location = '', facultyMappings = [] } = {}) {
  const activity = [];
  const db = {
    from(table) {
      let action = 'select';
      return {
        select() { return this; }, eq() { return this; }, lt() { return this; }, gt() { return this; }, in() { return this; }, limit() { return this; },
        async maybeSingle() {
          activity.push('read:' + table);
          if (table === 'classes') return { data: { id: 'class' }, error: classError };
          if (table === 'class_faculty') return { data: canManage ? { faculty_id: 'faculty' } : null, error: assignmentError };
          return { data: missingEntry ? null : { id: 'entry', class_id: 'class' }, error: null };
        },
        async insert(data) {
          activity.push('insert:' + table);
          assert.equal(data.college_id, 'college');
          assert.equal(data.created_by, 'faculty');
          return { error: insertError };
        },
        delete() { action = 'delete'; return this; },
        then(success, failure) {
          activity.push(action + ':' + table);
          return Promise.resolve(action === 'delete' ? { error: deleteError } : { data: table === 'class_schedule_entries' ? overlaps : facultyMappings, error: null }).then(success, failure);
        },
      };
    },
  };
  const exports = {};
  runInNewContext(code, { exports, console: { error() {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body }) } };
    if (name === '@/lib/http') return { requestProfile: async () => ({ profile: { college_id: 'college', role }, userId: 'faculty' }), isResponse: () => false };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => db };
    if (name === '@/lib/validators') return { classScheduleSchema: { safeParse: (data) => ({ success: true, data }) } };
    if (name === 'zod') return { z: { object: () => ({ safeParse: (data) => ({ success: !!data?.id, data }) }), string: () => ({ uuid: () => ({}) }) } };
    throw Error('Unexpected import ' + name);
  } });
  return {
    activity,
    post: () => exports.POST({ json: async () => ({ class_id: 'class', weekday: 1, start_time: '09:00', end_time: '10:00', location, notes: '' }) }),
    delete: () => exports.DELETE({ json: async () => ({ id: 'entry' }) }),
  };
}

test('faculty with an assigned class can insert a schedule entry', async () => {
  const api = harness();
  const response = await api.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(api.activity, ['read:classes', 'read:class_faculty', 'select:class_schedule_entries', 'insert:class_schedule_entries']);
});
test('insert permission failure points to SQL migration', async () => {
  const response = await harness({ insertError: { code: '42501' } }).post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /service-role SQL patch/i);
});
test('missing timetable table is diagnosed correctly', async () => {
  const response = await harness({ insertError: { code: 'PGRST205' } }).post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /table is missing/i);
});
test('duplicate class slot is reported instead of generic failure', async () => {
  const response = await harness({ insertError: { code: '23505' } }).post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /already exists/i);
});
test('foreign key mismatch reports invalid college or account relation', async () => {
  const response = await harness({ insertError: { code: '23503' } }).post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /profile/i);
});
test('an unassigned faculty user cannot insert a schedule', async () => {
  const api = harness({ canManage: false });
  const response = await api.post();
  assert.equal(response.status, 403);
  assert.equal(api.activity.some((item) => item.startsWith('insert:')), false);
});
test('faculty assignment verification error is not misreported as unassigned', async () => {
  const response = await harness({ assignmentError: { code: '42501' } }).post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /verify your faculty assignment/i);
});
test('class lookup database error is not misreported as class unavailable', async () => {
  const response = await harness({ classError: { code: '42501' } }).post();
  assert.equal(response.status, 503);
});
test('students cannot create or delete timetable entries', async () => {
  const api = harness({ role: 'student' });
  assert.equal((await api.post()).status, 403);
  assert.equal((await api.delete()).status, 403);
});
test('schedule deletion requires service-role grant', async () => {
  const response = await harness({ deleteError: { code: '42501' } }).delete();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /SQL patch/i);
});

test('overlapping sessions in the same class cannot be scheduled', async () => {
  const response = await harness({ overlaps: [{ class_id: 'class', location: '', start_time: '09:20', end_time: '10:30' }] }).post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /already has a timetable entry/i);
});
test('same room booking conflict is detected across classes', async () => {
  const response = await harness({ location: 'Room One', overlaps: [{ class_id: 'other', location: 'room one', start_time: '09:30', end_time: '10:30' }] }).post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /room/i);
});
test('faculty assigned to two classes cannot overlap', async () => {
  const response = await harness({ overlaps: [{ class_id: 'other', location: '', start_time: '09:10', end_time: '10:15' }],
    facultyMappings: [{ class_id: 'class', faculty_id: 'faculty' }, { class_id: 'other', faculty_id: 'faculty' }] }).post();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /faculty member/i);
});
