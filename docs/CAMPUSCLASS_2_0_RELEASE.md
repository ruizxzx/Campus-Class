# CampusClass 2.0: release notes and manual SQL rollout

GitHub release source: https://github.com/ruizxzx/Campus-Class (main)

**Status:** Major feature implementation with passing GitHub Actions CI. Production data,
tenancy isolation and the live user journey require acceptance tests. No live Supabase
database was changed during this work. These SQL patches must be run by the owner.

## Delivered feature areas

1. Student Success dashboard: rule-based academic support signals from attendance,
   released quiz marks, due work and recorded submissions; faculty follow-ups.
   Not a validated machine-learning risk prediction.
2. Faculty-generated time-limited QR attendance and enrollment-verified student check-ins,
   close/correct actions, college-scoped records, no QR data sent to an external service.
3. Unified gradebook for assignment/project marks, released quizzes and attendance;
   CSV download for authorized staff.
4. Course outcome/assessment mapping and indicative attainment from released scores.
5. Timed quiz sessions, saved answer drafts, server-enforced expiry, stable question
   shuffling and privacy-preserving results (the existing grading RPC is authoritative).
6. AI Study Copilot with grounded excerpts from published lesson text, syllabus outlines
   and course descriptions, plus practice-question and revision-plan modes.
7. Timetable class/room/faculty conflict detection, safe database trigger and suggested
   open times for staff.
8. Learning studio multi-chapter courses with chapter/lecture move controls.
9. Mobile shell with independently scrollable, accessible sidebar and consistent
   small-screen layouts.
10. PWA privacy fix: cache static resources, provide an offline fallback, do not cache
    signed-in pages or private resources. Optional device-local note drafts while
    the editor is already open, with explicit user consent.
11. English, Bengali and Hindi labels for common navigation and controls.
12. GitHub Actions automated regression tests, typecheck, lint and production build.

## Run new SQL manually in this order

Use ONLY the correct Campus Class Supabase project, from Supabase Dashboard -> SQL Editor.
Take a backup and review in a staging project first. Apply earlier migrations through
202611180025 if your database does not have them yet.

1. 202611180026_campusclass_20_academic_intelligence.sql
   Creates attendance, interventions and outcomes with indexes, RLS and grants.
   https://github.com/ruizxzx/Campus-Class/blob/main/supabase/migrations/202611180026_campusclass_20_academic_intelligence.sql

2. 202611180027_quiz_sessions_and_timer.sql
   Creates quiz draft sessions and protects submission with a database timer.
   IMPORTANT: this patch revokes direct execution of the older quiz-submission RPC.
   Deploy the new quiz UI and apply this migration as a coordinated release.
   https://github.com/ruizxzx/Campus-Class/blob/main/supabase/migrations/202611180027_quiz_sessions_and_timer.sql

3. 202611180028_timetable_conflicts.sql
   Prevents new overlapping class, instructor and room timetable entries.
   https://github.com/ruizxzx/Campus-Class/blob/main/supabase/migrations/202611180028_timetable_conflicts.sql

Prior permission fixes if missing:
- 202611180024_syllabus_service_role_write_access.sql
- 202611180025_timetable_service_role_access.sql

## Verify your SQL in the Campus Class SQL editor

    select to_regclass('public.attendance_sessions') is not null as attendance_ready,
           to_regclass('public.student_interventions') is not null as intervention_ready,
           to_regclass('public.course_outcomes') is not null as outcomes_ready,
           to_regclass('public.quiz_attempt_sessions') is not null as quiz_drafts_ready;

    select has_table_privilege('service_role','public.attendance_sessions','INSERT')
             as service_can_create_attendance,
           has_table_privilege('service_role','public.quiz_attempt_sessions','INSERT')
             as service_can_save_quiz_drafts,
           has_table_privilege('service_role','public.class_schedule_entries','INSERT')
             as service_can_save_timetable;

    select schemaname,tablename,policyname,cmd,roles
    from pg_policies
    where schemaname='public'
      and tablename in ('attendance_sessions','attendance_records',
                        'student_interventions','quiz_attempt_sessions','course_outcomes');

## 2.0 integrity and AI quota addendum (2026-11-18)

**Additional forward-only patches — run manually in order after 028:**

4. `202611180029_attendance_quiz_database_integrity.sql`
   - Database-clock attendance creation and check-in validity, active-enrollment
     validation, session row locks during check-in/closure, correction audit table.
   - Immutable quiz-session timing and assignment/enrollment checks in SQL.
   - The existing quiz submission guard now evaluates expiry with the actual
     database clock rather than the transaction-start timestamp.
   - Requires migrations 026–028 and existing quiz/attendance tables.
   - No existing student records are modified or dropped.

5. `202611180030_ai_request_quota.sql`
   - Atomic per-user, per-college budget of 30 paid OpenRouter requests per UTC hour.
   - Server-only RPC, RLS-protected usage data, no browser visibility.
   - Requires patch 029 and existing college/profile tables.
   - **Compatibility:** the updated OpenRouter client refuses AI requests until
     this patch is applied. Apply on staging first, then coordinate production
     deployment and SQL application. Other features do not depend on the quota RPC.
   - No existing AI settings or provider keys are changed.

**Read-only verification SQL** (run after both patches):

```sql
select to_regclass('public.attendance_correction_audit') is not null as audit_table_ready,
       to_regclass('public.ai_request_usage') is not null as ai_quota_table_ready,
       to_regprocedure('public.consume_ai_request_quota(uuid,uuid)') is not null as ai_quota_rpc_ready;
select tgname, tgenabled from pg_trigger
 where tgname in ('campusclass_attendance_session_clock',
                  'campusclass_attendance_record_guard',
                  'campusclass_attendance_correction_audit',
                  'campusclass_quiz_attempt_session_guard');
select has_function_privilege('service_role',
           'public.consume_ai_request_quota(uuid,uuid)', 'EXECUTE') as server_can_charge_quota,
       has_function_privilege('authenticated',
           'public.consume_ai_request_quota(uuid,uuid)', 'EXECUTE') as browser_cannot_charge_quota;
```

The `server_can_charge_quota` result must be true and
`browser_cannot_charge_quota` must be false. Confirm all four triggers are
enabled. Do NOT run a quota RPC as a read-only verification; it changes usage.

**Staging regression scenarios:** a QR check-in delayed until after expiry must
fail with HTTP 409, staff corrections must create audit rows, and simultaneous
check-ins must never create duplicates. Try to extend a quiz draft expiry via a
direct service-role staging request; the DB must reject the update. Confirm
draft saves after expiry are blocked, and that hour 31's AI request is rejected
without calling OpenRouter. Verify cross-college and unassigned faculty attempts
against both the API and the RLS policy in an isolated staging database.

**Failure and recovery:** both patches use transactions; a failed script should
roll back all changes inside that script. Correct prerequisites or permissions,
then retry that same patch after inspecting the error. There is no destructive
production rollback; disable any new application route dependent on a failed
migration until the prerequisite is fixed. Avoid removing the audit log or quota
table if they contain real data. For a failed syllabus metadata deletion, the PDF
now remains available. If metadata deletion succeeded but Storage cleanup failed,
the API reports `storageCleanupPending`; inspect the orphaned object manually
and remove it only after confirming no metadata row references it.

6. `202611180031_intervention_followups.sql`
   - Optional action plans, due dates, recorded outcomes and resolution time.
   - Apply after patch 030, then deploy the revised Student Success UI and API.
   - Existing interventions are retained with their new fields initially NULL.
   - Verify with: `select column_name from information_schema.columns where
     table_schema='public' and table_name='student_interventions' and
     column_name in ('action_plan','follow_up_at','outcome_note','resolved_at');`

**Known limitation:** the SQL trigger and RLS assertions are supplied as
`supabase/tests/campusclass_20_hardening.test.sql`, but require a disposable
database with all ordered migrations. GitHub CI does not run a Supabase service
or browser E2E suite; a passing GitHub build is not production acceptance.


## Manual staging acceptance checklist

- Test two fictional colleges, each with an admin, faculty and student account.
  Check that cross-college data access fails for every sensitive module.
- Faculty creates a 3-minute attendance QR; correct enrolled student checks in.
  Unenrolled user and expired or invalid token fail; replay is idempotent.
- Faculty closes a session and corrects an attendance row.
- Publish a quiz and assignment, have a student submit, and release marks.
  Confirm unreleased results never appear in the student's gradebook.
- Start a timed quiz, type, reload and confirm answer restoration and timer expiry;
  try to submit after expiry and verify the database denies it.
- Create course outcomes, map completed assessments, inspect attained percentages.
- Create class/room/faculty overlapping timetable entries and verify rejection.
- Test 320px/375px/768px screens, mobile drawer navigation, language preferences
  and keyboard access (including Escape, Tab and visible focus).
- During a temporary connection loss, opt into a private device draft in Notes,
  reload on the same device, reconnect and save; clear the local draft afterward.

## Additional completion work (November 18, 2026)

See [completion and deployment guide](CAMPUSCLASS_2_0_COMPLETION.md) for the
forward migrations 032 (Supabase Vault), 033 (reusable question bank),
034 (class Gradebook policies), 035 (college Student Success rules),
036 (atomic course authoring) and 037 (private Copilot history),
the administrator re-key process for old AI settings, on-demand PDF assistance,
Student Success exports and Gradebook/Outcomes corrections.

## Work not yet complete or live-verified

- On-demand PDF attachment is supported for a selected, accessible syllabus,
  but durable full-page PDF extraction, embeddings and vector retrieval are
  not implemented.
- A basic reusable staff question bank exists; advanced bulk authoring,
  negative marking, secure proctoring and high-stakes certification do not.
- No trained predictive model: transparent support rules are used instead.
- Learning Studio now supports chapter and lecture drag-and-drop reordering, with accessible arrow controls as a keyboard/touch fallback.
- Offline caching of private course PDFs is intentionally disabled. Unsaved note
  drafts are strictly opt-in and are not synchronized between devices.
- Shared navigation is multilingual but all app pages and faculty-generated
  content are NOT fully translated.
- No live Campus Class Supabase integration test, RLS fixture run, multi-tenant
  browser acceptance suite or actual mobile-device accessibility certification.

Do not represent this as bug-free or fully production-certified before completing
the staged acceptance checks. No SQL was applied live by the assistant.

## Completion hardening extension (SQL 036–037)

- Replaced non-atomic browser-side course creation with transactional,
  role-scoped server RPC. Added publication/archiving, safe lesson edits,
  curriculum preview and optimistic concurrency protections for faculty.
- Added persisted private student Copilot history, replay-safe request IDs,
  clear history, and explicit save-failure warnings without dropping AI answers.
- Improved Student Success with eight-week observed attendance/quiz trends,
  excused attendance denominator, pre-enrollment fairness, and paged history.
- Added real Vitest unit tests, Playwright desktop/mobile public smoke,
  optional authenticated staging role checks, and pnpm lockfile-aligned
  Vercel installs. Test outcomes must be inspected for the final commit.

See [completion guide](CAMPUSCLASS_2_0_COMPLETION.md),
[architecture](ARCHITECTURE.md) and [staging QA plan](TESTING.md).
