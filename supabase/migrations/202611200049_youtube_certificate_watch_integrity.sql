-- Campus Class / 049 — verify tracked playback before issuing certificates.
-- Forward-only after 048, run in the Campus Class Supabase project, not Tablely/Sellora.
-- Existing certificates are not silently revoked; inspect historic awards separately.
begin;
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
 -- A manually inserted lesson_progress row is NOT proof of imported-video viewing.
 if exists (
   select 1 from public.youtube_lesson_sources src
   join public.course_lessons l on l.id=src.lesson_id and l.college_id=src.college_id
   left join public.youtube_course_requirements r
     on r.college_id=src.college_id and r.course_id=src.course_id
   left join public.youtube_watch_progress wp
     on wp.college_id=src.college_id and wp.course_id=src.course_id
     and wp.lesson_id=src.lesson_id and wp.student_id=p_student
   where src.college_id=p_college and src.course_id=p_course and l.is_published
     and (wp.completed_at is null or wp.percent < coalesce(r.watched_threshold,90))
 ) then return false; end if;
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

commit;
-- OPTIONAL READ-ONLY HISTORICAL AUDIT (uncomment in SQL Editor):
-- select c.certificate_number, c.issued_at, src.lesson_id
-- from public.academic_certificates c
-- join public.youtube_lesson_sources src on src.college_id=c.college_id and src.course_id=c.course_id
-- left join public.youtube_course_requirements req on req.college_id=c.college_id and req.course_id=c.course_id
-- left join public.youtube_watch_progress wp on wp.college_id=c.college_id
--   and wp.course_id=c.course_id and wp.lesson_id=src.lesson_id and wp.student_id=c.student_id
-- where c.revoked_at is null and (wp.completed_at is null or wp.percent<coalesce(req.watched_threshold,90));
