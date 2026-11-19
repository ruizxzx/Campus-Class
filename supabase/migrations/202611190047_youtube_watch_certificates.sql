-- Campus Class 2.0 / 047 — watch evidence, academic requirements and certificate checks
-- MANUALLY apply after 046; forward-only. Does not revoke existing certificates.
begin;
alter table public.youtube_course_requirements
 add column if not exists min_quiz_percent integer not null default 50
 check(min_quiz_percent between 0 and 100);
alter table public.youtube_course_requirements
 add column if not exists min_assignment_percent integer not null default 50
 check(min_assignment_percent between 0 and 100);

create or replace function public.record_youtube_watch(
 p_session uuid,p_college uuid,p_student uuid,
 p_position numeric,p_state integer,p_rate numeric
) returns jsonb language plpgsql security invoker set search_path=''
as $body$
declare
 v_session public.youtube_watch_sessions%rowtype;
 v_source record;
 v_progress public.youtube_watch_progress%rowtype;
 v_coverage int4multirange;
 v_elapsed numeric;
 v_movement numeric;
 v_watched integer;
 v_percent numeric;
 v_threshold integer;
 v_complete timestamptz;
begin
 if p_session is null or p_college is null or p_student is null
  or p_position is null or p_position<0 or p_position>864000
  or p_state not in (0,1,2,3,5) or p_rate not between 0.25 and 2
 then raise exception 'Invalid playback progress' using errcode='22023'; end if;
 select * into v_session from public.youtube_watch_sessions
  where id=p_session and college_id=p_college and student_id=p_student for update;
 if not found or v_session.expires_at<=now() then
  raise exception 'Playback session expired or unauthorized' using errcode='42501'; end if;
 select s.course_id,s.duration_seconds,l.is_published,c.subject_id,c.status
  into v_source
 from public.youtube_lesson_sources s
 join public.course_lessons l on l.id=s.lesson_id and l.college_id=s.college_id
 join public.courses c on c.id=s.course_id and c.college_id=s.college_id
 where s.lesson_id=v_session.lesson_id and s.college_id=p_college;
 if p_position>v_source.duration_seconds+2 then
   raise exception 'Invalid playback timeline position' using errcode='22023'; end if;
 if not found or not v_source.is_published or v_source.status<>'active'
 then raise exception 'Lesson is unavailable' using errcode='42501'; end if;
 if not exists(
   select 1 from public.class_enrollments e
   join public.classes cl on cl.id=e.class_id and cl.college_id=e.college_id
   where cl.college_id=p_college and cl.subject_id=v_source.subject_id
     and cl.is_active and e.student_id=p_student and e.status='active'
 ) then raise exception 'Student is not enrolled in this subject' using errcode='42501'; end if;

 insert into public.youtube_watch_progress(
   college_id,student_id,lesson_id,course_id,duration_seconds
 ) values(p_college,p_student,v_session.lesson_id,v_source.course_id,v_source.duration_seconds)
 on conflict(student_id,lesson_id) do nothing;
 select * into v_progress from public.youtube_watch_progress
 where student_id=p_student and lesson_id=v_session.lesson_id
   and college_id=p_college for update;
 v_elapsed:=extract(epoch from now()-v_session.last_seen_at);
 v_movement:=p_position-v_session.last_position;
 v_coverage:=v_progress.watched_ranges;
 -- Only count plausible continuous playback. Seeking, pauses, long-sleep gaps,
 -- fast-forward or duplicate reports cannot add large unearned watch spans.
 if v_session.last_state=1 and p_state in(0,1,2)
   and v_elapsed between 1 and 35
   and v_movement>0 and v_movement<=v_elapsed*least(v_session.last_rate,2)+3
   and v_movement<=v_elapsed*2+3
 then
   v_coverage:=v_coverage+int4multirange(int4range(
     greatest(0,floor(v_session.last_position)::integer),
     least(v_source.duration_seconds,ceil(p_position)::integer),'[)'));
 end if;
 select coalesce(sum(upper(span)-lower(span)),0)::integer into v_watched
 from unnest(v_coverage) as spans(span);
 v_watched:=least(v_source.duration_seconds,v_watched);
 v_percent:=round((v_watched::numeric*100)/v_source.duration_seconds,2);
 select coalesce(r.watched_threshold,90) into v_threshold
 from public.youtube_course_requirements r
 where r.college_id=p_college and r.course_id=v_source.course_id;
 if v_threshold is null then v_threshold:=90; end if;
 v_complete:=v_progress.completed_at;
 if v_percent>=v_threshold and v_complete is null then v_complete:=now(); end if;
 update public.youtube_watch_progress set
  watched_ranges=v_coverage,watched_seconds=v_watched,
  position_seconds=least(v_source.duration_seconds,round(p_position)::integer),
  percent=v_percent,completed_at=v_complete,last_activity_at=now()
 where student_id=p_student and lesson_id=v_session.lesson_id;
 update public.youtube_watch_sessions set
  last_position=least(v_source.duration_seconds,p_position),
  last_state=p_state,last_rate=p_rate,last_seen_at=now()
 where id=p_session;
 if v_complete is not null then
   insert into public.lesson_progress(college_id,student_id,lesson_id)
   values(p_college,p_student,v_session.lesson_id)
   on conflict(lesson_id,student_id) do nothing;
 end if;
 return jsonb_build_object('watched_seconds',v_watched,'duration_seconds',v_source.duration_seconds,
   'position_seconds',least(v_source.duration_seconds,round(p_position)::integer),
   'percent',v_percent,'completed',v_complete is not null);
end
$body$;
revoke all on function public.record_youtube_watch(uuid,uuid,uuid,numeric,integer,numeric)
 from public,anon,authenticated;
grant execute on function public.record_youtube_watch(uuid,uuid,uuid,numeric,integer,numeric)
 to service_role;

-- Replaces SQL 040 function with optional academic completion gates.
-- A certificate already issued remains intact when faculty add new lectures
-- or edit requirements later; no silent revocation.
create or replace function private.issue_completed_course_certificate(
 p_college uuid,p_student uuid,p_course uuid
) returns boolean language plpgsql security definer set search_path=''
as $body$
declare
 v_course record; v_student record; v_college_name text;
 v_count integer; v_done integer; v_rule record; v_quiz record; v_assignment record;
begin
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('course-cert:'||p_student::text||':'||p_course::text,0));
 select id,title,subject_id into v_course from public.courses
  where id=p_course and college_id=p_college and status='active';
 select id,full_name into v_student from public.profiles
  where id=p_student and college_id=p_college and role='student' and status='active';
 if v_course.id is null or v_student.id is null then return false; end if;
 if not exists(select 1 from public.classes c
    join public.class_enrollments e on e.class_id=c.id and e.college_id=c.college_id
    where c.college_id=p_college and c.subject_id=v_course.subject_id and c.is_active
      and e.student_id=p_student and e.status='active') then return false; end if;
 -- Idempotent: existing awards are never lost because a playlist changed.
 if exists(select 1 from public.academic_certificates
   where college_id=p_college and student_id=p_student and course_id=p_course
    and revoked_at is null) then return true; end if;
 select count(*) into v_count from public.course_lessons l
 join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
 where m.course_id=p_course and m.college_id=p_college and l.is_published;
 if v_count=0 then return false; end if;
 select count(*) into v_done from public.lesson_progress p
 join public.course_lessons l on l.id=p.lesson_id and l.college_id=p.college_id
 join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
 where m.course_id=p_course and p.college_id=p_college and p.student_id=p_student
   and l.is_published;
 if v_done<>v_count then return false; end if;
 select * into v_rule from public.youtube_course_requirements
  where college_id=p_college and course_id=p_course;
 if found then
  if v_rule.required_quiz_id is not null then
    select id,max_marks into v_quiz from public.quizzes
     where college_id=p_college and id=v_rule.required_quiz_id;
    if not found or not exists(
      select 1 from public.quiz_attempts a
      where a.college_id=p_college and a.quiz_id=v_quiz.id and a.student_id=p_student
       and a.released_at is not null and a.status in('graded','returned')
       and a.score>=v_quiz.max_marks*v_rule.min_quiz_percent/100
    ) then return false; end if;
  end if;
  if v_rule.required_assignment_id is not null then
    select id,max_marks into v_assignment from public.assignments
     where college_id=p_college and id=v_rule.required_assignment_id;
    if not found or not exists(
      select 1 from public.assignment_submissions s
      join public.assignment_evaluations ev on ev.submission_id=s.id and ev.college_id=s.college_id
      where s.college_id=p_college and s.assignment_id=v_assignment.id
       and s.student_id=p_student and ev.released_at is not null
       and ev.marks>=v_assignment.max_marks*v_rule.min_assignment_percent/100
    ) then return false; end if;
  end if;
  if v_rule.faculty_approval_required and not exists(
    select 1 from public.youtube_course_approvals a
    where a.college_id=p_college and a.student_id=p_student and a.course_id=p_course
  ) then return false; end if;
 end if;
 select name into v_college_name from public.colleges where id=p_college;
 insert into public.academic_certificates(
   college_id,student_id,course_id,certificate_number,issued_by,metadata
 ) values(
   p_college,p_student,p_course,
   'CC-'||pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(gen_random_uuid()::text,'-',''),1,20)),
   p_student,
   pg_catalog.jsonb_build_object('college_name',v_college_name,
     'student_name',v_student.full_name,'course_title',v_course.title,
     'lesson_count',v_count,'award','Course Completion','issuance','automatic')
 );
 return true;
end
$body$;

create or replace function public.recheck_youtube_certificate(
 p_college uuid,p_student uuid,p_course uuid
) returns boolean language plpgsql security invoker set search_path=''
as $body$
begin
 return private.issue_completed_course_certificate(p_college,p_student,p_course);
end
$body$;
revoke all on function public.recheck_youtube_certificate(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.recheck_youtube_certificate(uuid,uuid,uuid) to service_role;

-- Recheck after later quiz/assignment grade release or faculty approval.
create or replace function private.youtube_quiz_release_recheck()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare v_course record;
begin
 if new.released_at is not null and new.score is not null then
   for v_course in select r.course_id from public.youtube_course_requirements r
     where r.college_id=new.college_id and r.required_quiz_id=new.quiz_id loop
     perform private.issue_completed_course_certificate(new.college_id,new.student_id,v_course.course_id);
   end loop;
 end if;
 return new;
end $body$;
drop trigger if exists youtube_quiz_release_recheck on public.quiz_attempts;
create trigger youtube_quiz_release_recheck after insert or update of released_at,score
on public.quiz_attempts for each row execute function private.youtube_quiz_release_recheck();

create or replace function private.youtube_assignment_release_recheck()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare v_student uuid; v_assignment uuid; v_course record;
begin
 if new.released_at is not null then
   select student_id,assignment_id into v_student,v_assignment
    from public.assignment_submissions where id=new.submission_id and college_id=new.college_id;
   for v_course in select r.course_id from public.youtube_course_requirements r
     where r.college_id=new.college_id and r.required_assignment_id=v_assignment loop
     perform private.issue_completed_course_certificate(new.college_id,v_student,v_course.course_id);
   end loop;
 end if;
 return new;
end $body$;
drop trigger if exists youtube_assignment_release_recheck on public.assignment_evaluations;
create trigger youtube_assignment_release_recheck after insert or update of released_at,marks
on public.assignment_evaluations for each row execute function private.youtube_assignment_release_recheck();

create or replace function private.youtube_approval_recheck()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
 perform private.issue_completed_course_certificate(new.college_id,new.student_id,new.course_id);
 return new;
end $body$;
drop trigger if exists youtube_approval_recheck on public.youtube_course_approvals;
create trigger youtube_approval_recheck after insert on public.youtube_course_approvals
for each row execute function private.youtube_approval_recheck();
commit;
