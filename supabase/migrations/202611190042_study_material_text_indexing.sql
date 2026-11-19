-- Campus Class / 042 — transactional library document text indexing
-- FORWARD ONLY; apply after migration 041 in the correct Supabase SQL Editor.
begin;
create or replace function public.replace_study_material_index(
 p_college_id uuid,p_material_id uuid,p_version_id uuid,
 p_extracted_text text,p_chunks jsonb
) returns integer language plpgsql security invoker set search_path=''
as $body$
declare v_index integer:=0; v_chunk jsonb;
begin
 if p_college_id is null or p_material_id is null or p_version_id is null
   or p_extracted_text is null or char_length(p_extracted_text) not between 20 and 120000
   or jsonb_typeof(p_chunks)<>'array' or jsonb_array_length(p_chunks) not between 1 and 96
 then raise exception 'Invalid library text index request' using errcode='22023'; end if;
 perform 1 from public.study_material_versions v
  join public.study_materials m on m.id=v.material_id and m.college_id=v.college_id
  where v.id=p_version_id and v.material_id=p_material_id and v.college_id=p_college_id
  for update of v;
 if not found then raise exception 'Library material version not found' using errcode='22023'; end if;
 -- Every SQL RPC executes in a transaction; replacement is all-or-nothing.
 delete from public.study_material_chunks
  where college_id=p_college_id and material_id=p_material_id and version_id=p_version_id;
 for v_chunk in select * from jsonb_array_elements(p_chunks) loop
   if jsonb_typeof(v_chunk)<>'object'
     or char_length(v_chunk->>'content') not between 10 and 3000
     or (v_chunk->>'page') is not null
       and (v_chunk->>'page')::integer not between 1 and 100000
   then raise exception 'Invalid library text chunk' using errcode='22023'; end if;
   insert into public.study_material_chunks(
     college_id,material_id,version_id,chunk_index,page_number,chunk_text
   ) values (
     p_college_id,p_material_id,p_version_id,v_index,
     (v_chunk->>'page')::integer,v_chunk->>'content'
   );
   v_index:=v_index+1;
 end loop;
 update public.study_material_versions
   set extracted_text=p_extracted_text,indexed_at=now()
   where id=p_version_id and material_id=p_material_id and college_id=p_college_id;
 return v_index;
end
$body$;
revoke all on function public.replace_study_material_index(uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.replace_study_material_index(uuid,uuid,uuid,text,jsonb)
  to service_role;
commit;
