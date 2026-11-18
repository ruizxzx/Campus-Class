-- CampusClass 2.0: forward-only repair for server-delivered class notices and posts.
-- Run in the Campus Class Supabase SQL Editor after migrations 001-037.
-- No existing policies, content, submissions, or student data are changed.
begin;
do $campusclass$
begin
  if to_regclass('public.notifications') is null
    or to_regclass('public.announcements') is null
    or to_regclass('public.class_stream_posts') is null
    or to_regclass('public.stream_targets') is null
    or to_regclass('public.stream_attachments') is null then
    raise exception 'Campus Class core and learning-collaboration migrations must be applied first.';
  end if;
end
$campusclass$;

grant usage on schema public to service_role;
-- PostgREST UPSERT ... ON CONFLICT DO NOTHING ... RETURNING id requires
-- SELECT in addition to INSERT. Migration 005 granted INSERT alone.
grant select, insert on table public.notifications to service_role;
-- Class announcement notification endpoint reads the announcement first.
grant select on table public.announcements to service_role;
-- Server-only /api/stream/posts must create, publish, and roll back posts.
-- RLS is still enabled; these permissions are NOT given to browser users.
grant select, insert, update, delete on table public.class_stream_posts to service_role;
grant select, insert, delete on table public.stream_targets to service_role;
grant select, insert, delete on table public.stream_attachments to service_role;
commit;

-- Read-only verification; expect true for all rows after applying this patch:
-- select v.table_name, v.privilege, has_table_privilege('service_role',
--   format('public.%I',v.table_name), v.privilege) as permitted
-- from (values ('notifications','SELECT'),('notifications','INSERT'),
--   ('announcements','SELECT'),('class_stream_posts','INSERT'),
--   ('class_stream_posts','UPDATE'),('class_stream_posts','DELETE'),
--   ('stream_targets','INSERT'),('stream_attachments','INSERT')) v(table_name, privilege);
