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

## Work not yet complete or live-verified

- AI reference material does NOT extract the full text from arbitrary uploaded PDFs;
  it cites available published text and syllabus outlines only.
- No comprehensive reusable question-bank authoring UI, secure proctoring, negative
  marking or high-stakes exam certification.
- No trained predictive model: transparent support rules are used instead.
- Course reorder uses accessible arrow controls, not drag-and-drop editing.
- Offline caching of private course PDFs is intentionally disabled. Unsaved note
  drafts are strictly opt-in and are not synchronized between devices.
- Shared navigation is multilingual but all app pages and faculty-generated
  content are NOT fully translated.
- No live Campus Class Supabase integration test, RLS fixture run, multi-tenant
  browser acceptance suite or actual mobile-device accessibility certification.

Do not represent this as bug-free or fully production-certified before completing
the staged acceptance checks. No SQL was applied live by the assistant.
