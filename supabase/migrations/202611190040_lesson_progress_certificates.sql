-- Campus Class 2.0 / 040 — secure lesson progress and automatic course certificates
-- FORWARD ONLY. Apply manually in the actual Campus Class Supabase SQL Editor
-- after 001-039. Does not delete or overwrite student progress or certificates.
begin;
do $$
begin
 if to_regclass('public.lesson_progress') is null
    or to_regclass('public.academic_certificates') is null
    or to_regclass('public.course_lessons') is null then
   raise exception 'Apply Campus Class learning collaboration migrations first';
 end if;
end $$;

grant usage on schema public to service_role;
grant select, insert on public.lesson_progress to service_role;
grant select, insert on public.academic_certificates to service_role;
grant select on public.courses, public.course_modules, public.course_lessons,
  public.classes, public.class_enrollments, public.profiles, public.colleges to service_role;

-- Live certificates are unique per student and course. Do not destroy legacy duplicates.
do $$
begin
 if exists (
   select 1 from public.academic_certificates
   where revoked_at is null
   group by college_id,student_id,course_id having count(*) > 1
 ) then
   raise warning 'Duplicate active course certificates exist: clean up manually before enforcing unique index';
 else
   create unique index if not exists academic_certificate_active_course_uniq
     on public.academic_certificates(college_id,student_id,course_id)
     where revoked_at is null;
 end if;
end $$;

create or replace function private.issue_completed_course_certificate(
 p_college uuid,p_student uuid,p_course uuid
) returns boolean language plpgsql security definer set search_path=''
as $body$
declare
 v_course record;
 v_student record;
 v_college_name text;
 v_count integer;
 v_done integer;
begin
 -- Per-student+course transaction lock prevents two concurrent final lessons
 -- from both missing completion, or issuing two certificates.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('course-cert:'||p_student::text||':'||p_course::text,0)
 );
 select id,title,subject_id into v_course from public.courses
  where id=p_course and college_id=p_college and status='active';
 select id,full_name into v_student from public.profiles
  where id=p_student and college_id=p_college and role='student' and status='active';
 if v_course.id is null or v_student.id is null then return false; end if;
 if not exists (
   select 1 from public.classes c
   join public.class_enrollments e on e.class_id=c.id and e.college_id=c.college_id
   where c.college_id=p_college and c.subject_id=v_course.subject_id
   and c.is_active=true and e.student_id=p_student and e.status='active'
 ) then return false; end if;
 select count(*) into v_count from public.course_lessons l
 join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
 where m.course_id=p_course and m.college_id=p_college and l.is_published=true;
 if v_count=0 then return false; end if;
 select count(*) into v_done from public.lesson_progress progress
 join public.course_lessons l on l.id=progress.lesson_id and l.college_id=progress.college_id
 join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
 where m.course_id=p_course and progress.college_id=p_college
 and progress.student_id=p_student and l.is_published=true;
 if v_done<>v_count then return false; end if;
 if exists(select 1 from public.academic_certificates
    where college_id=p_college and student_id=p_student and course_id=p_course
      and revoked_at is null) then return true; end if;
 select name into v_college_name from public.colleges where id=p_college;
 insert into public.academic_certificates(
   college_id,student_id,course_id,certificate_number,issued_by,metadata
 ) values (
   p_college,p_student,p_course,
   'CC-'||pg_catalog.upper(pg_catalog.substr(
     pg_catalog.replace(gen_random_uuid()::text,'-',''),1,20)),
   p_student,
   pg_catalog.jsonb_build_object(
      'college_name',v_college_name,
      'student_name',v_student.full_name,
      'course_title',v_course.title,
      'lesson_count',v_count,
      'award','Course Completion',
      'issuance','automatic')
 );
 return true;
end
$body$;

-- Trigger runs under restricted private function, not from browser credentials.
create or replace function private.after_lesson_progress_certificate()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare v_course uuid;
begin
 select m.course_id into v_course
 from public.course_lessons l
 join public.course_modules m on m.college_id=l.college_id and m.id=l.module_id
 where l.id=new.lesson_id and l.college_id=new.college_id
   and l.is_published=true;
 if v_course is not null then
   perform private.issue_completed_course_certificate(new.college_id,new.student_id,v_course);
 end if;
 return new;
end
$body$;
drop trigger if exists lesson_progress_certificate_issue on public.lesson_progress;
create trigger lesson_progress_certificate_issue
after insert on public.lesson_progress for each row
execute function private.after_lesson_progress_certificate();

-- Grant select to staff for legitimate college subject course tracking.
drop policy if exists "assigned faculty view student lesson progress" on public.lesson_progress;
create policy "assigned faculty view student lesson progress" on public.lesson_progress
for select to authenticated
using (
 college_id=(select private.current_college_id())
 and (
   private.is_admin(college_id)
   or exists (
     select 1 from public.course_lessons lesson
       join public.course_modules module on module.id=lesson.module_id and module.college_id=lesson.college_id
       join public.courses course on course.id=module.course_id and course.college_id=module.college_id
       join public.classes cls on cls.subject_id=course.subject_id and cls.college_id=course.college_id
       join public.class_faculty f on f.class_id=cls.id and f.college_id=cls.college_id
       join public.class_enrollments e on e.class_id=cls.id and e.college_id=cls.college_id
     where lesson.id=lesson_progress.lesson_id and lesson.college_id=lesson_progress.college_id
       and e.student_id=lesson_progress.student_id and e.status='active'
       and f.faculty_id=(select auth.uid())
   )
 )
);
grant select on public.lesson_progress to authenticated;

-- Reconcile existing completed courses without deleting or changing prior rows.
do $$
declare row_item record;
begin
 for row_item in
   select distinct p.college_id,p.student_id,m.course_id
   from public.lesson_progress p
   join public.course_lessons l on l.id=p.lesson_id and l.college_id=p.college_id and l.is_published
   join public.course_modules m on m.id=l.module_id and m.college_id=l.college_id
 loop
   perform private.issue_completed_course_certificate(
     row_item.college_id,row_item.student_id,row_item.course_id);
 end loop;
end $$;
commit;

-- Verify manually:
-- select has_table_privilege('service_role','public.lesson_progress','INSERT') as can_insert;
-- select count(*) from public.academic_certificates where revoked_at is null;
