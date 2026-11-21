-- CONDITIONAL ONLY: Section A relforcerowsecurity=true AND the actual service_role
-- owns this table AND is not BYPASSRLS. BYPASSRLS roles ignore FORCE RLS; nonowners
-- remain subject to RLS even without FORCE. Never use this as a general workaround.
begin;
do $gate$
begin
  if not exists (
    select 1 from pg_class c join pg_roles r on r.oid=c.relowner
    where c.oid='public.quiz_attempt_sessions'::regclass
      and c.relrowsecurity and c.relforcerowsecurity and r.rolname='service_role'
      and not r.rolbypassrls and not r.rolsuper
  ) then raise exception '058: FORCE RLS is not a demonstrated owner-role obstacle'; end if;
  if exists(select 1 from pg_policy where polrelid='public.quiz_attempt_sessions'::regclass)
    or exists(select 1 from unnest(array['anon','authenticated']) r
      where has_table_privilege(r,'public.quiz_attempt_sessions','SELECT,INSERT,UPDATE,DELETE')
        or has_any_column_privilege(r,'public.quiz_attempt_sessions','SELECT,INSERT,UPDATE')
        or pg_has_role(r,'service_role','USAGE'))
  then raise exception '058: unexpected session policies or client privileges; refuse mode repair'; end if;
end
$gate$;
alter table public.quiz_attempt_sessions no force row level security;
-- RLS remains enabled. No policies, role attributes or grants modified.
commit;
