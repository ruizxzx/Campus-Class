-- Campus Class 2.0 / 048 — repair privileged YouTube course publishing.
-- Forward-only; MANUALLY execute after 045, 046 and 047 in the Campus Class
-- Supabase project used by the production Vercel environment.
-- Live Vercel imports failed with PostgreSQL SQLSTATE 42501 during the
-- apply_youtube_playlist_import RPC after metadata fetching succeeded.
-- The SQL 046 routine is SECURITY INVOKER, so its service_role caller needs
-- explicit INSERT/UPDATE/SELECT grants on the legacy course tables.
-- This patch does not change RLS policies, course records, progress, or awards.
begin;

grant usage on schema public to service_role;

-- A new import inserts a draft course, appends modules and lessons, then
-- publishes the course. Sync may lock an existing course and edit lesson text.
-- SELECT and UPDATE are required for SELECT ... FOR UPDATE.
grant select, insert, update on table public.courses to service_role;
grant select, insert, update on table public.course_modules to service_role;
grant select, insert, update on table public.course_lessons to service_role;

-- SQL 046 records the successful transaction in this existing audit table.
-- Keep activity-log access server-only (consistent with historical SQL 004).
grant select, insert on table public.activity_logs to service_role;

-- Validate the exact role and tables used by the production RPC without
-- executing a course import or modifying college/student data.
do $check$
begin
  if not (
    has_table_privilege('service_role','public.courses','SELECT')
    and has_table_privilege('service_role','public.courses','INSERT')
    and has_table_privilege('service_role','public.courses','UPDATE')
    and has_table_privilege('service_role','public.course_modules','SELECT')
    and has_table_privilege('service_role','public.course_modules','INSERT')
    and has_table_privilege('service_role','public.course_lessons','SELECT')
    and has_table_privilege('service_role','public.course_lessons','INSERT')
    and has_table_privilege('service_role','public.course_lessons','UPDATE')
    and has_table_privilege('service_role','public.activity_logs','INSERT')
    and has_function_privilege(
      'service_role',
      'public.apply_youtube_playlist_import(uuid,uuid,text,text,boolean,jsonb,boolean)',
      'EXECUTE')
  ) then
    raise exception 'Campus Class YouTube apply permissions are incomplete; confirm 046 and service_role grants';
  end if;
end
$check$;

commit;

-- Optional read-only verification, after COMMIT:
-- select has_table_privilege('service_role','public.courses','INSERT') as can_create_course,
--        has_table_privilege('service_role','public.course_modules','INSERT') as can_create_chapter,
--        has_table_privilege('service_role','public.course_lessons','INSERT') as can_create_lecture,
--        has_table_privilege('service_role','public.courses','UPDATE') as can_publish_course;
