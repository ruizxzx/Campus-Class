-- CONDITIONAL ONLY: Section A service_role can_insert=false on quiz_attempt_sessions.
-- Restore just the original 027 server INSERT privilege, not client access.
begin;
do $gate$
begin
  if has_table_privilege('service_role','public.quiz_attempt_sessions','INSERT') then
    raise exception '059: server INSERT already granted; do not apply';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.quiz_attempt_sessions'::regclass) then
    raise exception '059: expected session RLS is disabled; inspect schema';
  end if;
end
$gate$;
grant insert on table public.quiz_attempt_sessions to service_role;
commit;
