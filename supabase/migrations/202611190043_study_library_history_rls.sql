-- Campus Class 2.0 / 043 — restrict superseded library versions at RLS layer
-- Forward-only; run manually after SQL 040, 041 and 042 in the Campus Class project.
-- No document, version, chunk, bookmark or student record is deleted.
begin;
do $$
begin
 if to_regclass('public.study_materials') is null
  or to_regclass('public.study_material_versions') is null
  or to_regclass('public.study_material_chunks') is null then
  raise exception 'Apply forward migration 041 (study library) first';
 end if;
end $$;

-- The base material reader policy alone does not distinguish a current
-- published file from a previous version. This function does.
create or replace function private.can_read_study_material_version(
 p_college uuid,p_material uuid,p_version uuid
) returns boolean language sql stable security definer set search_path=''
as $body$
 select exists (
   select 1 from public.study_material_versions v
   join public.study_materials m on m.id=v.material_id and m.college_id=v.college_id
   where v.id=p_version and v.material_id=p_material and v.college_id=p_college
    and p_college=(select private.current_college_id())
    and (
      -- Students: ONLY the currently published version for an active class.
      (m.status='published' and m.current_version=v.version
       and private.can_access_class(m.class_id))
      -- Admin/faculty: permit historical versions for authorized classes.
      or private.is_admin(p_college)
      or private.is_faculty_in_class(p_college,m.class_id)
    )
 );
$body$;

revoke all on function private.can_read_study_material_version(uuid,uuid,uuid)
 from public,anon;
grant execute on function private.can_read_study_material_version(uuid,uuid,uuid)
 to authenticated,service_role;

drop policy if exists "library version visibility" on public.study_material_versions;
create policy "library version visibility" on public.study_material_versions
 for select to authenticated using (
   private.can_read_study_material_version(college_id,material_id,id)
 );

drop policy if exists "library chunk visibility" on public.study_material_chunks;
create policy "library chunk visibility" on public.study_material_chunks
 for select to authenticated using (
   private.can_read_study_material_version(college_id,material_id,version_id)
 );
commit;

-- Manual RLS verification against test students:
-- authenticated student in class A may SELECT only current version/chunks;
-- archived/draft materials, previous versions and class B materials: zero rows.
-- assigned faculty/admin in class A can inspect previous versions.
