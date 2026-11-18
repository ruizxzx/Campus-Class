-- CampusClass academic reporting: restore missing read grants to the trusted
-- server-only Supabase service_role. Forward-only, additive, idempotent.
-- The three production pages fail before their data load with PostgreSQL
-- code 42501 when service_role cannot SELECT classes or joined subjects.
--
-- Apply in Campus Class Supabase SQL Editor. Do not run on unrelated projects.
-- This script does not modify any student data, RLS policy or browser grants.
begin;
grant usage on schema public to service_role;
do $campusclass$
declare
  table_name text;
begin
  if to_regclass('public.classes') is null
     or to_regclass('public.subjects') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Campus Class core tables are not installed in this database.';
  end if;
  -- PostgreSQL requires ordinary table privileges even for roles that bypass
  -- row-level security. Earlier migrations granted selected academic reads to
  -- authenticated but omitted multiple service_role reads.
  --
  -- Grant only SELECT, only to the trusted server role. Later optional tables
  -- are skipped when not installed; apply any missing migrations 026-035 too.
  foreach table_name in array array[
    'classes','subjects','profiles','class_faculty','class_enrollments',
    'assignments','assignment_submissions','assignment_evaluations',
    'quizzes','quiz_attempts',
    'attendance_sessions','attendance_records','student_interventions',
    'course_outcomes','outcome_assessments',
    'class_gradebook_policies','student_success_rules'
  ] loop
    if to_regclass(format('public.%I',table_name)) is not null then
      execute format('grant select on table public.%I to service_role', table_name);
    end if;
  end loop;
end
$campusclass$;
commit;

-- Read-only verification; run after the patch:
-- select name as required_table,
--   to_regclass(format('public.%I', name)) is not null as exists_in_database,
--   case when to_regclass(format('public.%I', name)) is not null
--     then has_table_privilege('service_role',format('public.%I',name),'SELECT')
--     else false end as service_role_can_select
-- from unnest(array['classes','subjects','quizzes','quiz_attempts',
--   'attendance_sessions','attendance_records','student_interventions',
--   'course_outcomes','outcome_assessments',
--   'class_gradebook_policies','student_success_rules']) as t(name)
-- order by name;
--
-- If all required existing tables return true but runtime still reports 42501,
-- verify the Vercel production SUPABASE_SERVICE_ROLE_KEY belongs to this same
-- Supabase project and is a genuine service-role/secret key, then redeploy.
