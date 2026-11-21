-- CONDITIONAL ONLY: Section B insert_grant=true, returning_grant=false,
-- college_matches=true, creator_matches=true, can_manage_class=true.
-- Re-establish existing 009 grant; don't change RLS.
begin;
do $gate$
begin
  if not has_table_privilege('authenticated','public.assignments','INSERT')
    or has_table_privilege('authenticated','public.assignments','SELECT')
    or not (select relrowsecurity from pg_class where oid='public.assignments'::regclass)
  then raise exception '061: missing SELECT hypothesis not supported or RLS disabled'; end if;
end
$gate$;
grant select on public.assignments to authenticated;
commit;
