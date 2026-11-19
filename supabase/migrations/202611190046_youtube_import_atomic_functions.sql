-- Campus Class 2.0 / 046 — atomic job claims and course import apply
-- Forward-only after 045. All functions callable only by the trusted service role.
begin;
create or replace function public.claim_youtube_import_jobs(p_limit integer default 2)
returns setof public.youtube_import_jobs
language plpgsql security invoker set search_path=''
as $body$
begin
 if p_limit not between 1 and 5 then raise exception 'Invalid worker batch'; end if;
 return query
 with claimed as (
   select j.id from public.youtube_import_jobs j
   where j.status='queued'
      or (j.status='processing' and j.lock_expires_at < now())
   order by j.created_at,j.id
   for update skip locked
   limit p_limit
 )
 update public.youtube_import_jobs j
 set status='processing',attempts=j.attempts+1,
     lock_expires_at=now()+interval '3 minutes',updated_at=now(),
     failure_code=null,failure_message=null
 from claimed
 where j.id=claimed.id and j.attempts<8
 returning j.*;
end
$body$;

create or replace function public.claim_specific_youtube_import_job(p_job uuid)
returns setof public.youtube_import_jobs
language sql security invoker set search_path=''
as $body$
 with claimed as (
   select id from public.youtube_import_jobs
   where id=p_job and attempts<8
     and (status='queued' or (status='processing' and lock_expires_at<now()))
   for update skip locked
 )
 update public.youtube_import_jobs j set
   status='processing',attempts=j.attempts+1,
   lock_expires_at=now()+interval '3 minutes',updated_at=now(),
   failure_code=null,failure_message=null
 from claimed where j.id=claimed.id returning j.*;
$body$;
revoke all on function public.claim_specific_youtube_import_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_specific_youtube_import_job(uuid) to service_role;

create or replace function public.apply_youtube_playlist_import(
 p_job_id uuid,p_actor uuid,p_title text,p_description text,
 p_publish boolean,p_modules jsonb,p_overwrite_titles boolean default false
) returns jsonb
language plpgsql security invoker set search_path=''
as $body$
declare
 j public.youtube_import_jobs%rowtype;
 v_course uuid;
 v_source uuid;
 v_module uuid;
 v_module_entry jsonb;
 v_lesson_entry jsonb;
 v_item public.youtube_import_items%rowtype;
 v_course_title text;
 v_module_position integer;
 v_lesson_position integer;
 v_lesson uuid;
 v_added integer:=0;
 v_skipped integer:=0;
 v_renamed integer:=0;
 v_total integer:=0;
 v_source_lesson record;
begin
 if p_job_id is null or p_actor is null or p_modules is null
   or jsonb_typeof(p_modules)<>'array'
   or jsonb_array_length(p_modules) not between 1 and 80
   or char_length(p_title) not between 2 and 180
   or char_length(p_description)>10000
 then raise exception 'Invalid playlist course payload' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('yt-job:'||p_job_id::text,0));
 select * into j from public.youtube_import_jobs where id=p_job_id for update;
 if not found then raise exception 'Import job not found' using errcode='22023'; end if;
 if j.created_by<>p_actor then raise exception 'Import job owner mismatch' using errcode='42501'; end if;
 if j.status='applied' then
   return jsonb_build_object('course_id',j.target_course_id,'already_applied',true);
 end if;
 if j.status<>'review' then raise exception 'Import not ready for faculty review' using errcode='22023'; end if;
 v_course:=j.target_course_id;
 if v_course is null then
   insert into public.courses(college_id,subject_id,title,description,status)
   values(j.college_id,j.subject_id,p_title,p_description,'archived') returning id into v_course;
 else
   perform 1 from public.courses c where c.college_id=j.college_id
     and c.id=v_course and c.subject_id=j.subject_id for update;
   if not found then raise exception 'Target course is not in the imported subject' using errcode='42501'; end if;
 end if;
 insert into public.youtube_playlist_sources(
   college_id,course_id,playlist_id,title,created_by,last_checked_at
 ) values(j.college_id,v_course,j.playlist_id,j.playlist_title,p_actor,now())
 on conflict(college_id,course_id,playlist_id) do update
   set last_checked_at=excluded.last_checked_at
 returning id into v_source;

 select coalesce(max(position)+1,0) into v_module_position
 from public.course_modules where college_id=j.college_id and course_id=v_course;
 for v_module_entry in select value from jsonb_array_elements(p_modules) loop
   if jsonb_typeof(v_module_entry)<>'object'
     or char_length(trim(coalesce(v_module_entry->>'title',''))) not between 2 and 180
     or jsonb_typeof(v_module_entry->'lessons')<>'array'
     or jsonb_array_length(v_module_entry->'lessons') not between 1 and 500 then
     raise exception 'Invalid chapter/lecture structure' using errcode='22023';
   end if;
   -- Only create a module if at least one new item needs it. When syncing
   -- existing videos their edited titles/positions can be updated without
   -- creating empty chapters.
   v_module:=null;
   v_lesson_position:=0;
   for v_lesson_entry in select value from jsonb_array_elements(v_module_entry->'lessons') loop
     v_total:=v_total+1;
     if v_total>1200 then raise exception 'Too many lectures in one atomic import; split the playlist' using errcode='22023'; end if;
     if (v_lesson_entry->>'item_id') is null
       or char_length(trim(coalesce(v_lesson_entry->>'title',''))) not between 2 and 180
       or char_length(coalesce(v_lesson_entry->>'description',''))>20000 then
       raise exception 'Invalid lecture item' using errcode='22023';
     end if;
     select * into v_item from public.youtube_import_items
       where id=(v_lesson_entry->>'item_id')::uuid
         and college_id=j.college_id and job_id=j.id;
     if not found or v_item.availability<>'available'
       or v_item.video_id is null or v_item.duration_seconds<1 then
       raise exception 'An unavailable video was selected' using errcode='22023';
     end if;
     select ls.lesson_id,ls.metadata_edited into v_source_lesson
       from public.youtube_lesson_sources ls
       where ls.college_id=j.college_id and ls.course_id=v_course
         and ls.video_id=v_item.video_id for update;
     if found then
       v_skipped:=v_skipped+1;
       if p_overwrite_titles and not v_source_lesson.metadata_edited then
         update public.course_lessons set
           title=trim(v_lesson_entry->>'title'),
           plain_text=coalesce(v_lesson_entry->>'description',''),updated_at=now()
         where id=v_source_lesson.lesson_id and college_id=j.college_id;
         v_renamed:=v_renamed+1;
       end if;
       update public.youtube_lesson_sources set
         playlist_position=v_item.playlist_position,removed_from_playlist_at=null,synced_at=now()
         where lesson_id=v_source_lesson.lesson_id;
       continue;
     end if;
     if v_module is null then
       insert into public.course_modules(college_id,course_id,title,position)
       values(j.college_id,v_course,trim(v_module_entry->>'title'),v_module_position)
       returning id into v_module;
       v_module_position:=v_module_position+1;
     end if;
     insert into public.course_lessons(
       college_id,module_id,title,plain_text,video_url,duration_minutes,is_published,position
     ) values(
       j.college_id,v_module,trim(v_lesson_entry->>'title'),
       coalesce(v_lesson_entry->>'description',''),
       'https://www.youtube.com/watch?v='||v_item.video_id,
       greatest(1,ceil(v_item.duration_seconds::numeric/60)::integer),
       p_publish,v_lesson_position
     ) returning id into v_lesson;
     insert into public.youtube_lesson_sources(
       college_id,course_id,lesson_id,source_id,video_id,playlist_position,duration_seconds
     ) values(j.college_id,v_course,v_lesson,v_source,v_item.video_id,v_item.playlist_position,v_item.duration_seconds);
     v_lesson_position:=v_lesson_position+1;
     v_added:=v_added+1;
   end loop;
 end loop;
 if v_added+v_skipped=0 then raise exception 'No videos chosen for import' using errcode='22023'; end if;
 -- Sync never deletes published lessons, student completions or certificates.
 if j.mode='sync' then
   update public.youtube_lesson_sources ls
   set removed_from_playlist_at=coalesce(ls.removed_from_playlist_at,now())
   where ls.source_id=v_source and ls.college_id=j.college_id
     and not exists(
       select 1 from public.youtube_import_items i
       where i.job_id=j.id and i.college_id=j.college_id
         and i.video_id=ls.video_id);
 end if;
 if p_publish then
   update public.courses set status='active',updated_at=now()
   where id=v_course and college_id=j.college_id;
 end if;
 update public.youtube_import_jobs set status='applied',
   target_course_id=v_course,completed_at=now(),lock_expires_at=null,updated_at=now()
 where id=j.id;
 insert into public.activity_logs(college_id,actor_id,action,entity_type,entity_id)
 values(j.college_id,p_actor,
   case when j.mode='sync' then 'youtube.playlist.synced' else 'youtube.playlist.imported' end,
   'course',v_course);
 return jsonb_build_object('course_id',v_course,'added',v_added,
   'existing',v_skipped,'renamed',v_renamed,'published',p_publish);
end
$body$;

revoke all on function public.claim_youtube_import_jobs(integer) from public,anon,authenticated;
revoke all on function public.apply_youtube_playlist_import(uuid,uuid,text,text,boolean,jsonb,boolean)
 from public,anon,authenticated;
grant execute on function public.claim_youtube_import_jobs(integer) to service_role;
grant execute on function public.apply_youtube_playlist_import(uuid,uuid,text,text,boolean,jsonb,boolean)
 to service_role;
commit;
