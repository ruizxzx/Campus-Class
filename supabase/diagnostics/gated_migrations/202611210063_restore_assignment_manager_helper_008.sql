-- CONDITIONAL ONLY: Section B admin=true, can_manage_class=false, matching
-- college/creator and both grants true. Section A must show stale/corrupted
-- can_manage_class definition; review diff against 008 before applying.
-- Replace placeholders with exact affected actor, college and class UUIDs.
begin;
select set_config('ccdiag.repair_actor','ACTUAL_ACTOR_UUID',true);
select set_config('ccdiag.repair_college','PAYLOAD_COLLEGE_UUID',true);
select set_config('ccdiag.repair_class','PAYLOAD_CLASS_UUID',true);
select set_config('request.jwt.claim.sub',current_setting('ccdiag.repair_actor')::uuid::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('ccdiag.repair_actor')::uuid,'role','authenticated')::text,true);
set local role authenticated;
do $gate$
begin
  if private.current_college_id() is distinct from current_setting('ccdiag.repair_college')::uuid
     or private.is_admin(current_setting('ccdiag.repair_college')::uuid) is distinct from true
     or private.can_manage_class(current_setting('ccdiag.repair_class')::uuid) is distinct from false
     or not has_table_privilege(current_user,'public.assignments','INSERT')
     or not has_table_privilege(current_user,'public.assignments','SELECT')
  then raise exception '063: Section B manager-helper hypothesis not reproduced'; end if;
end
$gate$;
reset role;
do $gate$
begin
  if exists(select 1 from pg_proc where oid='private.can_manage_class(uuid)'::regprocedure
      and regexp_replace(prosrc,'\s+','','g')=regexp_replace($expected$
  select private.is_admin(private.current_college_id()) or exists (
    select 1
    from public.classes c
    join public.class_faculty cf
      on cf.class_id = c.id
     and cf.college_id = c.college_id
    join public.profiles faculty
      on faculty.id = cf.faculty_id
     and faculty.college_id = cf.college_id
    where c.id = _class_id
      and c.college_id = private.current_college_id()
      and cf.faculty_id = (select auth.uid())
      and cf.can_manage_assignments
      and faculty.role = 'faculty'
      and faculty.status = 'active'
  )
$expected$,'\s+','','g') and prosecdef and proconfig=array['search_path=""']) then
    raise exception '063: helper already matches 008; investigate its dependencies instead';
  end if;
end
$gate$;
create or replace function private.can_manage_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(private.current_college_id()) or exists (
    select 1
    from public.classes c
    join public.class_faculty cf
      on cf.class_id = c.id
     and cf.college_id = c.college_id
    join public.profiles faculty
      on faculty.id = cf.faculty_id
     and faculty.college_id = cf.college_id
    where c.id = _class_id
      and c.college_id = private.current_college_id()
      and cf.faculty_id = (select auth.uid())
      and cf.can_manage_assignments
      and faculty.role = 'faculty'
      and faculty.status = 'active'
  )
$$;
revoke all on function private.can_manage_class(uuid) from public,anon;
grant execute on function private.can_manage_class(uuid) to authenticated;
set local role authenticated;
do $gate$
begin
  if private.can_manage_class(current_setting('ccdiag.repair_class')::uuid) is distinct from true
  then raise exception '063: original manager predicate still false; rollback'; end if;
end
$gate$;
reset role;
commit;
