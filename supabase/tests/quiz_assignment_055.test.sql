-- Run in a DISPOSABLE local Supabase database only, never production.
-- Fixtures are synthetic and rolled back. Assumes 001-055 and pgTAP installed.
begin;
select plan(9);
create function pg_temp.as_role(p_role text, p_sql text) returns void
language plpgsql security invoker as $$
begin
  execute format('set local role %I', p_role);
  execute p_sql;
  reset role;
exception when others then
  reset role;
  raise;
end;
$$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e5000000-0000-4000-8000-000000000002','quiz-admin@example.test','{}'),
 ('e5000000-0000-4000-8000-000000000003','quiz-faculty@example.test','{}'),
 ('e5000000-0000-4000-8000-000000000004','quiz-student@example.test','{}');
insert into public.colleges(id,name,slug) values ('e5000000-0000-4000-8000-000000000001','Quiz test college','quiz-test-055');
insert into public.profiles(id,college_id,role,full_name,email) values
 ('e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','admin','Test Admin','quiz-admin@example.test'),
 ('e5000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001','faculty','Test Faculty','quiz-faculty@example.test'),
 ('e5000000-0000-4000-8000-000000000004','e5000000-0000-4000-8000-000000000001','student','Test Student','quiz-student@example.test');
insert into public.departments(id,college_id,name,code) values ('e5000000-0000-4000-8000-000000000005','e5000000-0000-4000-8000-000000000001','Test department','TD');
insert into public.subjects(id,college_id,department_id,name,code) values ('e5000000-0000-4000-8000-000000000006','e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000005','Test subject','TS');
insert into public.classes(id,college_id,subject_id,section,academic_year,semester,created_by) values ('e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000006','A','2026-2027',1,'e5000000-0000-4000-8000-000000000002');
insert into public.class_faculty(college_id,class_id,faculty_id,can_manage_assignments) values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003',true);
insert into public.class_enrollments(college_id,class_id,student_id) values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000004');
insert into public.quizzes(id,college_id,class_id,created_by,title,status,max_marks,show_score_after_submit)
values ('e5000000-0000-4000-8000-000000000008','e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003','Test quiz','published',1,true);
insert into public.quiz_questions(id,college_id,quiz_id,position,question_type,prompt,options,answer_key,marks)
values ('e5000000-0000-4000-8000-000000000009','e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000008',1,'multiple_choice','Choose A','["A","B"]','"A"',1);
select lives_ok(format('select pg_temp.as_role(%L,%L)', 'service_role', $sql$insert into public.quiz_attempt_sessions(college_id,quiz_id,student_id,attempt_number,expires_at)
values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000008','e5000000-0000-4000-8000-000000000004',1,now()+interval '1 minute') returning id$sql$),'053 allows server session insertion');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"e5000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok(format('select pg_temp.as_role(%L,%L)', 'authenticated', $sql$select public.submit_quiz_attempt_v2('e5000000-0000-4000-8000-000000000008','{}')$sql$),'22023','Quiz answers must be a non-empty JSON object.','empty answers rejected');
select lives_ok(format('select pg_temp.as_role(%L,%L)', 'authenticated', $sql$select public.submit_quiz_attempt_v2('e5000000-0000-4000-8000-000000000008','{"e5000000-0000-4000-8000-000000000009":"A"}')$sql$),'valid answer submits through timer wrapper (fails on 007 before 055)');
select is((select score from public.quiz_attempts where quiz_id='e5000000-0000-4000-8000-000000000008'),1::numeric,'correct answer scored');
select is((select count(*) from public.quiz_attempt_sessions where quiz_id='e5000000-0000-4000-8000-000000000008'),0::bigint,'session consumed');
select ok(not has_function_privilege('authenticated','public.submit_quiz_attempt(uuid,jsonb)','EXECUTE'),'legacy direct grader remains blocked');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"e5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok(format('select pg_temp.as_role(%L,%L)', 'authenticated', $sql$insert into public.assignments(college_id,class_id,created_by,title)
values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000002','Admin assignment') returning id$sql$),'admin own creator INSERT RETURNING');
select throws_ok(format('select pg_temp.as_role(%L,%L)', 'authenticated', $sql$insert into public.assignments(college_id,class_id,created_by,title)
values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003','Copied assignment') returning id$sql$),'42501',null,'admin cannot copy a different creator');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"e5000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok(format('select pg_temp.as_role(%L,%L)', 'authenticated', $sql$insert into public.assignments(college_id,class_id,created_by,title)
values ('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003','Faculty assignment') returning id$sql$),'assigned faculty INSERT RETURNING');
select * from finish();
rollback;

