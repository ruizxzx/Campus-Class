-- Forward-only patch 036: transactional, non-destructive course authoring.
-- Run manually after 035. Do not run on the production database from ChatGPT.
-- Existing courses, lesson IDs, student progress and storage references survive.
begin;
create or replace function public.save_course_curriculum(
  p_college_id uuid,
  p_actor_id uuid,
  p_action text,
  p_course_id uuid,
  p_subject_id uuid,
  p_title text,
  p_description text,
  p_modules jsonb,
  p_publish boolean,
  p_expected_updated_at timestamptz
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_actor_role text;
  v_subject uuid;
  v_course_id uuid;
  v_current_updated_at timestamptz;
  v_module jsonb;
  v_lesson jsonb;
  v_module_id uuid;
  v_lesson_id uuid;
  v_seen_modules uuid[] := array[]::uuid[];
  v_seen_lessons uuid[] := array[]::uuid[];
  v_module_position integer := 0;
  v_lesson_position integer;
  v_total_lessons integer := 0;
  v_link text;
  v_is_published boolean;
begin
  if p_college_id is null or p_actor_id is null
      or p_action not in ('create','update','archive','publish')
      or p_action is null then
    raise exception 'Invalid course operation' using errcode='22023';
  end if;
  select p.role into v_actor_role
  from public.profiles p where p.id=p_actor_id and p.college_id=p_college_id
    and p.status='active';
  if v_actor_role is null or v_actor_role not in ('admin','faculty') then
    raise exception 'Staff account is not authorized' using errcode='42501';
  end if;

  if p_action='create' then
    if p_course_id is not null or p_subject_id is null
      or not exists(select 1 from public.subjects s
        where s.id=p_subject_id and s.college_id=p_college_id and s.is_active=true) then
      raise exception 'Choose an active subject' using errcode='22023';
    end if;
    v_subject:=p_subject_id;
  else
    if p_course_id is null then
      raise exception 'Course ID is required' using errcode='22023';
    end if;
    select c.subject_id,c.id,c.updated_at into v_subject,v_course_id,v_current_updated_at
    from public.courses c where c.id=p_course_id and c.college_id=p_college_id
    for update;
    if v_course_id is null then
      raise exception 'Course unavailable' using errcode='P0002';
    end if;
    if p_subject_id is distinct from v_subject then
      raise exception 'Changing a course subject would invalidate academic history'
        using errcode='22023';
    end if;
    if p_expected_updated_at is null or
      p_expected_updated_at is distinct from v_current_updated_at then
      raise exception 'Course changed since it was opened; reload before saving'
        using errcode='40001';
    end if;
  end if;

  if v_actor_role='faculty' and not exists (
    select 1 from public.class_faculty cf
    join public.classes cl on cl.id=cf.class_id and cl.college_id=cf.college_id
    where cf.college_id=p_college_id and cf.faculty_id=p_actor_id
      and cl.subject_id=v_subject and cl.is_active=true
  ) then
    raise exception 'Faculty is not assigned to this subject'
      using errcode='42501';
  end if;

  if p_action='archive' or p_action='publish' then
    update public.courses set status=case when p_action='archive' then 'archived' else 'active' end,
      updated_at=pg_catalog.clock_timestamp()
    where id=v_course_id and college_id=p_college_id;
    return v_course_id;
  end if;

  if p_title is null or char_length(trim(p_title)) not between 2 and 180
    or char_length(coalesce(p_description,''))>5000
    or p_modules is null or jsonb_typeof(p_modules)<>'array'
    or jsonb_array_length(p_modules) not between 1 and 30
    or p_publish is null then
    raise exception 'Invalid course title, modules or publication state' using errcode='22023';
  end if;

  if p_action='create' then
    insert into public.courses(college_id,subject_id,title,description,status)
    values(p_college_id,v_subject,trim(p_title),coalesce(p_description,''),
      case when p_publish then 'active' else 'archived' end)
    returning id into v_course_id;
  else
    update public.courses set title=trim(p_title),
      description=coalesce(p_description,''),
      status=case when p_publish then 'active' else 'archived' end,
      updated_at=pg_catalog.clock_timestamp()
    where id=v_course_id and college_id=p_college_id;
  end if;

  for v_module in select value from jsonb_array_elements(p_modules)
  loop
    if jsonb_typeof(v_module)<>'object'
      or char_length(trim(coalesce(v_module->>'title',''))) not between 2 and 180
      or jsonb_typeof(v_module->'lessons')<>'array'
      or jsonb_array_length(v_module->'lessons') not between 1 and 50 then
      raise exception 'Invalid course chapter' using errcode='22023';
    end if;
    if coalesce(v_module->>'id','')<>'' then
      v_module_id:=(v_module->>'id')::uuid;
      if v_module_id=any(v_seen_modules) then
        raise exception 'Duplicate chapter ID' using errcode='22023';
      end if;
      update public.course_modules set title=trim(v_module->>'title'),
        position=v_module_position,description=nullif(v_module->>'description','')
      where id=v_module_id and course_id=v_course_id and college_id=p_college_id;
      if not found then
        raise exception 'Chapter belongs to another course' using errcode='42501';
      end if;
    else
      insert into public.course_modules(college_id,course_id,title,description,position)
      values(p_college_id,v_course_id,trim(v_module->>'title'),
        nullif(v_module->>'description',''),v_module_position)
      returning id into v_module_id;
    end if;
    v_seen_modules:=array_append(v_seen_modules,v_module_id);
    v_lesson_position:=0;
    for v_lesson in select value from jsonb_array_elements(v_module->'lessons')
    loop
      v_total_lessons:=v_total_lessons+1;
      if v_total_lessons>300
        or jsonb_typeof(v_lesson)<>'object'
        or char_length(trim(coalesce(v_lesson->>'title',''))) not between 2 and 180
        or char_length(coalesce(v_lesson->>'plain_text',''))>20000 then
        raise exception 'Invalid lecture or too many lectures' using errcode='22023';
      end if;
      v_link:=nullif(trim(coalesce(v_lesson->>'video_url','')),'');
      if v_link is not null and (char_length(v_link)>2000 or v_link !~* '^https://[^[:space:]]+$') then
        raise exception 'Lecture video URL must use HTTPS' using errcode='22023';
      end if;
      v_is_published:=coalesce((v_lesson->>'is_published')::boolean,false);
      if coalesce(v_lesson->>'id','')<>'' then
        v_lesson_id:=(v_lesson->>'id')::uuid;
        if v_lesson_id=any(v_seen_lessons) then
          raise exception 'Duplicate lecture ID' using errcode='22023';
        end if;
        update public.course_lessons set
          module_id=v_module_id,title=trim(v_lesson->>'title'),
          plain_text=coalesce(v_lesson->>'plain_text',''),
          video_url=v_link,is_published=v_is_published,
          position=v_lesson_position,updated_at=pg_catalog.clock_timestamp()
        where id=v_lesson_id and college_id=p_college_id
          and module_id in (select m.id from public.course_modules m
            where m.course_id=v_course_id and m.college_id=p_college_id);
        if not found then
          raise exception 'Lecture belongs to another course' using errcode='42501';
        end if;
      else
        insert into public.course_lessons(
          college_id,module_id,title,plain_text,video_url,is_published,position
        ) values(p_college_id,v_module_id,trim(v_lesson->>'title'),
          coalesce(v_lesson->>'plain_text',''),v_link,v_is_published,v_lesson_position)
        returning id into v_lesson_id;
      end if;
      v_seen_lessons:=array_append(v_seen_lessons,v_lesson_id);
      v_lesson_position:=v_lesson_position+1;
    end loop;
    v_module_position:=v_module_position+1;
  end loop;

  -- Never delete or silently orphan existing lessons; student progress,
  -- completion timestamps, citations and uploaded resources remain intact.
  if exists (select 1 from public.course_modules m
    where m.college_id=p_college_id and m.course_id=v_course_id
      and not (m.id=any(v_seen_modules))) or exists (
      select 1 from public.course_lessons l
      join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
      where m.college_id=p_college_id and m.course_id=v_course_id
        and not (l.id=any(v_seen_lessons))
    ) then
    raise exception 'Existing chapters/lectures cannot be omitted; unpublish lectures instead'
      using errcode='22023';
  end if;
  return v_course_id;
end $$;
revoke all on function public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)
  to service_role;
commit;

-- Read-only post-deploy verification:
-- select has_function_privilege('service_role',
--  'public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)', 'EXECUTE');
-- select has_function_privilege('authenticated',
--  'public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)', 'EXECUTE');
