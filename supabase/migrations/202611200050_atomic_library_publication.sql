-- Campus Class / 050: atomic batch publication with rechecked college/staff scope.
-- Forward-only; apply after 049 to the Campus Class Supabase project.
begin;
create or replace function public.publish_study_material_batch(
 p_college uuid,p_actor uuid,p_items jsonb
) returns integer language plpgsql security invoker set search_path=''
as $body$
declare
 v_item jsonb;
 v_material uuid;
 v_version uuid;
 v_seen uuid[]:=array[]::uuid[];
 v_class uuid;
 v_status text;
 v_ver integer;
 v_role text;
 v_count integer:=0;
begin
 if p_college is null or p_actor is null
  or jsonb_typeof(p_items)<>'array'
  or jsonb_array_length(p_items) not between 2 and 10 then
  raise exception 'Invalid library publication batch' using errcode='22023';
 end if;
 select role into v_role from public.profiles
  where id=p_actor and college_id=p_college and status='active';
 if v_role is null or v_role not in ('admin','faculty') then
  raise exception 'Library staff authorization required' using errcode='42501';
 end if;
 -- Prevalidate and lock every target: no material changes until all pass.
 for v_item in select value from pg_catalog.jsonb_array_elements(p_items) as j(value) loop
  v_material:=(v_item->>'material_id')::uuid;
  v_version:=(v_item->>'version_id')::uuid;
  if v_material is null or v_version is null or v_material=any(v_seen) then
   raise exception 'Duplicate or invalid library material' using errcode='22023';
  end if;
  v_seen:=pg_catalog.array_append(v_seen,v_material);
  select class_id,status into v_class,v_status from public.study_materials
   where id=v_material and college_id=p_college for update;
  if not found or v_status='archived' then
   raise exception 'Library material unavailable' using errcode='42501';
  end if;
  if not exists(select 1 from public.classes c
     where c.id=v_class and c.college_id=p_college and c.is_active) then
   raise exception 'Class is not active' using errcode='42501';
  end if;
  if v_role='faculty' and not exists (
   select 1 from public.class_faculty f where f.college_id=p_college
    and f.class_id=v_class and f.faculty_id=p_actor
  ) then
   raise exception 'Faculty classroom authorization required' using errcode='42501';
  end if;
  select version into v_ver from public.study_material_versions
   where id=v_version and college_id=p_college and material_id=v_material;
  if not found then
   raise exception 'Study material version unavailable' using errcode='22023';
  end if;
 end loop;
 -- Every UPDATE is in the same RPC transaction and rolls back on ANY error.
 for v_item in select value from pg_catalog.jsonb_array_elements(p_items) as j(value) loop
  v_material:=(v_item->>'material_id')::uuid;
  v_version:=(v_item->>'version_id')::uuid;
  update public.study_materials m
   set status='published',current_version=v.version,updated_at=now()
   from public.study_material_versions v
   where m.college_id=p_college and m.id=v_material
    and v.college_id=p_college and v.material_id=m.id and v.id=v_version;
  if not found then raise exception 'Library transaction rolled back' using errcode='P0001'; end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end
$body$;
revoke all on function public.publish_study_material_batch(uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.publish_study_material_batch(uuid,uuid,jsonb) to service_role;
commit;
