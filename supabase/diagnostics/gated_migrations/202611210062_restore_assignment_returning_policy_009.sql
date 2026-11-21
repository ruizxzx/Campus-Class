-- CONDITIONAL ONLY: Section B college_matches/creator_matches/is_admin/
-- can_manage_class/insert_grant/returning_grant=true; Section A shows exactly
-- the old 001 SELECT predicate (no manager path). Do not apply to unknown policies.
begin;
do $gate$
declare old_policy record;
begin
  select * into old_policy from pg_policy where polrelid='public.assignments'::regclass
    and polname='members read class assignments';
  if not found or old_policy.polcmd<>'r' or not old_policy.polpermissive
    or old_policy.polroles<>array[(select oid from pg_roles where rolname='authenticated')]
    or regexp_replace(pg_get_expr(old_policy.polqual,old_policy.polrelid),'[\s()]','','g')
       not in ('college_id=SELECTprivate.current_college_idAScurrent_college_idANDprivate.can_access_assignmentid',
               'college_id=SELECTprivate.current_college_idANDprivate.can_access_assignmentid')
    or exists(select 1 from pg_policy where polrelid='public.assignments'::regclass
      and polcmd in ('r','*') and polname<>'members read class assignments')
    or not (select relrowsecurity from pg_class where oid='public.assignments'::regclass)
  then raise exception '062: live SELECT policy is not the exact known 001 predecessor; inspect before changing'; end if;
end
$gate$;
alter policy "members read class assignments" on public.assignments
using (
  college_id = (select private.current_college_id())
  and (private.can_access_assignment(id) or private.can_manage_class(class_id))
);
commit;
