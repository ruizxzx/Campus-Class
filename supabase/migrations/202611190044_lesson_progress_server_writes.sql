-- Campus Class 2.0 / 044 — server-only lesson completion writes
-- Forward-only. Manually run AFTER migration 043 on the Campus Class project.
-- Retains all existing student completions, XP and certificates.
begin;
do $$
begin
 if to_regclass('public.lesson_progress') is null then
   raise exception 'Lesson-progress schema is missing. Apply the learning migrations first';
 end if;
end $$;

-- Original learning collaboration SQL 002 granted authenticated clients all
-- write privileges to lesson_progress, allowing students to bypass the secure
-- /api/lessons/complete enrollment and published-lesson checks. With the new
-- server endpoint those privileges are unnecessary and dangerous (XP farming).
revoke insert, update, delete on table public.lesson_progress
  from public, anon, authenticated;
-- Students still need to read their own progress; existing RLS policies
-- continue to enforce ownership and faculty-assigned reports.
grant select on table public.lesson_progress to authenticated;
-- The trusted server endpoint is the only supported write path.
grant select, insert on table public.lesson_progress to service_role;
commit;

-- Manual confirmation (expect false, false, false, true):
-- select has_table_privilege('authenticated','public.lesson_progress','INSERT') as browser_insert,
--        has_table_privilege('authenticated','public.lesson_progress','UPDATE') as browser_update,
--        has_table_privilege('authenticated','public.lesson_progress','DELETE') as browser_delete,
--        has_table_privilege('service_role','public.lesson_progress','INSERT') as server_insert;
