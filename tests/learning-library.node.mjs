import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("lesson completion is authenticated and server-authoritative",()=>{
 const button=read("components/lesson-complete-button.tsx");
 const api=read("app/api/lessons/complete/route.ts");
 assert.match(button,/\/api\/lessons\/complete/);
 assert.doesNotMatch(button,/from\("lesson_progress"\)/);
 for(const token of ["requestProfile()","class_enrollments",'status", "active"','ignoreDuplicates: true']){
   assert.ok(api.includes(token),"missing "+token);
 }
});
test("automatic certificates have a single database-triggered issuance point",()=>{
 const sql=read("supabase/migrations/202611190040_lesson_progress_certificates.sql");
 assert.match(sql,/create trigger lesson_progress_certificate_issue/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/academic_certificate_active_course_uniq/);
 assert.match(sql,/where revoked_at is null/);
 assert.doesNotMatch(sql,/truncate table|drop table|disable row level security/i);
});
test("faculty course report scopes enrollment to assigned subjects",()=>{
 const src=read("app/(app)/faculty/progress/page.tsx");
 assert.match(src,/requireRole\(\["faculty","admin"\]\)/);
 assert.match(src,/class_faculty/);
 assert.match(src,/class_enrollments/);
 assert.match(src,/lesson_progress/);
});
test("stream uploader handles multiple private files without Vercel multipart limits",()=>{
 const ui=read("components/faculty-learning-studio.tsx");
 const route=read("app/api/stream/batch/route.ts");
 assert.match(ui,/type="file" multiple/);
 assert.match(ui,/uploadToSignedUrl/);
 assert.match(route,/createSignedUploadUrl/);
 assert.match(route,/published_at:null/);
 assert.match(route,/\.info\(file.storage_path\)/);
});
test("library saves immutable versions with server-only metadata writes",()=>{
 const api=read("app/api/library/materials/route.ts");
 const sql=read("supabase/migrations/202611190041_study_materials_library.sql");
 assert.match(api,/createSignedUploadUrl/);
 assert.match(api,/upload/);
 assert.match(api,/current_version/);
 assert.match(sql,/study_material_versions/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/bucket.*study-library/);
});
test("PDF previews and downloads are authorized for active class members",()=>{
 const api=read("app/api/library/files/route.ts");
 assert.match(api,/requestProfile\(\)/);
 assert.match(api,/libraryClassAccess/);
 assert.match(api,/createSignedUrl/);
 assert.match(api,/Previous versions are available to faculty only/);
 assert.doesNotMatch(api,/getPublicUrl/);
});
test("reading progress and bookmarks require student membership",()=>{
 const api=read("app/api/library/progress/route.ts");
 assert.match(api,/actor.profile.role!=="student"/);
 assert.match(api,/libraryClassAccess/);
 assert.match(api,/study_material_bookmarks/);
 assert.match(api,/study_material_progress/);
});
test("indexed PDF text writes atomically and AI uses extracted text",()=>{
 const ai=read("app/api/library/ai/route.ts");
 const sql=read("supabase/migrations/202611190042_study_material_text_indexing.sql");
 assert.match(ai,/extractSyllabusPdf/);
 assert.match(ai,/replace_study_material_index/);
 assert.match(ai,/version.extracted_text/);
 assert.match(ai,/AI returned an invalid/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/revoke all on function/);
});
test("certificate view uses college-branded immutable metadata and user authorization",()=>{
 const page=read("app/(app)/certificates/[certificateId]/page.tsx");
 assert.match(page,/cert.student_id!==profile.id/);
 assert.match(page,/collegeName/);
 assert.match(page,/certificate_number/);
});
test("syllabus uploads use signed multi-PDF private storage",()=>{
 const ui=read("components/academic-planning.tsx");
 const route=read("app/api/syllabi/batch/route.ts");
 assert.match(ui,/type="file" multiple/);
 assert.match(ui,/uploadToSignedUrl/);
 assert.match(route,/createSignedUploadUrl/);
 assert.match(route,/class_syllabi/);
});

test("library search never displays snippets from superseded file versions",()=>{
 const page=read("app/(app)/library/page.tsx");
 assert.match(page,/study_material_versions/);
 assert.match(page,/currentVersions/);
 assert.match(page,/\.in\("version_id",currentVersions\.slice/);
 assert.doesNotMatch(page,/\.in\("material_id",ids\.slice\(start,start\+75\)\)\s*\.textSearch/);
});
test("faculty can inspect which students finished each lecture, not just totals",()=>{
 const page=read("app/(app)/faculty/progress/page.tsx");
 assert.match(page,/completedByStudent/);
 assert.match(page,/completedLessonIds/);
 assert.match(page,/Lecture \{i\+1\}/);
 assert.match(page,/p\.completedLessonIds\.includes\(lesson.id\)/);
});

test("course page explains enrollment when completion cannot be safely saved",()=>{
 const page=read("app/(app)/courses/[courseId]/page.tsx");
 assert.match(page,/canTrackProgress/);
 assert.match(page,/class_enrollments/);
 assert.match(page,/status", "active"/);
 assert.match(page,/Join your subject class/);
 assert.match(page,/isStudent=\{profile.role === "student" && canTrackProgress\}/);
});

test("Supabase RLS prevents students selecting superseded library version text",()=>{
 const sql=read("supabase/migrations/202611190043_study_library_history_rls.sql");
 assert.match(sql,/create or replace function private.can_read_study_material_version/);
 assert.match(sql,/m\.current_version=v\.version/);
 assert.match(sql,/private\.is_faculty_in_class/);
 assert.match(sql,/drop policy if exists "library version visibility"/);
 assert.match(sql,/drop policy if exists "library chunk visibility"/);
 assert.match(sql,/private\.can_read_study_material_version\(college_id,material_id,version_id\)/);
 assert.doesNotMatch(sql,/drop table|truncate table|disable row level security/i);
});
