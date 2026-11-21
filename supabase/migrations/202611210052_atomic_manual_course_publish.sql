-- Forward-only: atomic manual course publication. Apply after SQL 051.
-- Uses existing server-only course table privileges from 048. No existing rows or RLS policies changed.
begin;
create or replace function public.publish_manual_course(
  p_college_id uuid, p_actor_id uuid, p_subject_id uuid,
  p_title text, p_description text, p_chapters jsonb
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_role text;
  v_course uuid;
  v_module uuid;
  v_chapter jsonb;
  v_lesson jsonb;
  v_chapter_pos integer := 0;
  v_lesson_pos integer;
begin
  select role::text into v_role from public.profiles
  where id=p_actor_id and college_id=p_college_id and status='active';
  if v_role is null or v_role not in ('admin','faculty') then
    raise exception using errcode='42501', message='Active faculty or administrator required.';
  end if;
  if not exists (select 1 from public.subjects where id=p_subject_id and college_id=p_college_id and is_active) then
    raise exception using errcode='42501', message='Subject is not available in your college.';
  end if;
  if v_role='faculty' and not exists (
    select 1 from public.class_faculty cf
    join public.classes c on c.id=cf.class_id and c.college_id=cf.college_id
    where cf.college_id=p_college_id and cf.faculty_id=p_actor_id
      and c.subject_id=p_subject_id and c.is_active
  ) then
    raise exception using errcode='42501', message='You are not assigned to this subject.';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 300
    or length(coalesce(p_description,''))>20000
    or jsonb_typeof(p_chapters) is distinct from 'array' then
    raise exception using errcode='22023', message='Invalid course title, description or chapters.';
  end if;
  if jsonb_array_length(p_chapters) not between 1 and 100 then
    raise exception using errcode='22023', message='Add between 1 and 100 chapters.';
  end if;
  insert into public.courses(college_id,subject_id,title,description,status)
    values(p_college_id,p_subject_id,btrim(p_title),btrim(coalesce(p_description,'')),'archived')
    returning id into v_course;
  for v_chapter in select value from pg_catalog.jsonb_array_elements(p_chapters) loop
    if coalesce(length(btrim(v_chapter->>'title')),0) not between 1 and 300
      or jsonb_typeof(v_chapter->'lessons') is distinct from 'array' then
      raise exception using errcode='22023', message='Every chapter requires a title and lectures.';
    end if;
    if jsonb_array_length(v_chapter->'lessons') not between 1 and 100 then
      raise exception using errcode='22023', message='Each chapter must have 1 to 100 lectures.';
    end if;
    insert into public.course_modules(college_id,course_id,title,position)
      values(p_college_id,v_course,btrim(v_chapter->>'title'),v_chapter_pos)
      returning id into v_module;
    v_lesson_pos:=0;
    for v_lesson in select value from pg_catalog.jsonb_array_elements(v_chapter->'lessons') loop
      if coalesce(length(btrim(v_lesson->>'title')),0) not between 1 and 300
        or length(coalesce(v_lesson->>'content',''))>50000
        or length(coalesce(v_lesson->>'video',''))>2000 then
        raise exception using errcode='22023', message='Invalid lecture title or content.';
      end if;
      insert into public.course_lessons(college_id,module_id,title,plain_text,video_url,is_published,position)
        values(p_college_id,v_module,btrim(v_lesson->>'title'),
          btrim(coalesce(v_lesson->>'content','')),nullif(btrim(v_lesson->>'video'),''),true,v_lesson_pos);
      v_lesson_pos:=v_lesson_pos+1;
    end loop;
    v_chapter_pos:=v_chapter_pos+1;
  end loop;
  update public.courses set status='active' where id=v_course and college_id=p_college_id;
  if not found then raise exception 'Course publication failed.'; end if;
  return v_course;
end
$$;
revoke all on function public.publish_manual_course(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_manual_course(uuid,uuid,uuid,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
