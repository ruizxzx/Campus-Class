-- BUG-N1 and BUG-03: read-only live diagnostics. CAMPUS CLASS only.
-- Run section A without editing; share outputs (no passwords or JWTs).
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('assignments','classes','class_faculty','profiles','quiz_attempt_sessions','quizzes','quiz_attempts','class_enrollments')
order by tablename,policyname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='private' and p.proname in ('current_college_id','current_role','is_admin','can_manage_class','can_access_assignment','is_faculty_in_class','is_enrolled_in_class','guard_quiz_attempt_session','submit_quiz_attempt_guarded'))
or (n.nspname='public' and p.proname in ('submit_quiz_attempt','submit_quiz_attempt_v2')) order by n.nspname,p.proname;
select c.relname,r.rolname,r.rolbypassrls,c.relrowsecurity,c.relforcerowsecurity,
has_table_privilege(r.rolname,c.oid,'SELECT') as can_select,has_table_privilege(r.rolname,c.oid,'INSERT') as can_insert,
has_any_column_privilege(r.rolname,c.oid,'UPDATE') as can_update_any_column
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r
where n.nspname='public' and c.relname in ('quizzes','quiz_attempt_sessions','quiz_attempts','class_enrollments','assignments','classes','class_faculty','profiles')
and r.rolname in ('authenticated','service_role') order by c.relname,r.rolname;
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('assignments','quiz_attempt_sessions') and not t.tgisinternal;
select has_column_privilege('service_role','public.quizzes','status','UPDATE') as quiz_status_lock_grant,
has_schema_privilege('service_role','public','USAGE') as server_public_usage,
has_schema_privilege('authenticated','private','USAGE') as authenticated_private_usage,
has_function_privilege('authenticated','public.submit_quiz_attempt(uuid,jsonb)','EXECUTE') as legacy_grader_exposed,
to_regprocedure('pg_catalog.jsonb_object_length(jsonb)') is not null as nonstandard_function_exists;

-- Section B: replace EVERY placeholder below with the exact UUID from the
-- failed assignment request / authenticated actor. Run separately for admin and faculty.
-- The output is booleans and role only. This never attempts an INSERT.
begin read only;
select set_config('request.jwt.claim.sub','ACTUAL_ACTOR_UUID',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','ACTUAL_ACTOR_UUID','role','authenticated')::text,true);
select set_config('ccdiag.college','PAYLOAD_COLLEGE_UUID',true),
       set_config('ccdiag.class','PAYLOAD_CLASS_UUID',true),
       set_config('ccdiag.creator','PAYLOAD_CREATED_BY_UUID',true),
       set_config('ccdiag.source','KNOWN_GOOD_ASSIGNMENT_UUID',true);
set local role authenticated;
select current_user as postgres_role,private.current_role() as profile_role,
 auth.uid() is not null as uid_exists,
 private.current_college_id()=current_setting('ccdiag.college')::uuid as college_matches,
 auth.uid()=current_setting('ccdiag.creator')::uuid as creator_matches,
 private.is_admin(current_setting('ccdiag.college')::uuid) as is_admin,
 private.can_manage_class(current_setting('ccdiag.class')::uuid) as can_manage_class,
 private.can_access_assignment(current_setting('ccdiag.source')::uuid) as can_read_source,
 has_table_privilege(current_user,'public.assignments','INSERT') as insert_grant,
 has_table_privilege(current_user,'public.assignments','SELECT') as returning_grant;
rollback;

-- Section C: inspect the exact student and wda quiz, no draft answers or PII.
-- Replace placeholders with the test student's auth UUID and the exact quiz UUID.
with target as (
 select q.id,q.college_id,q.class_id,q.status,q.opens_at,q.closes_at,q.attempts_allowed,q.duration_minutes
 from public.quizzes q where q.id='QUIZ_UUID'::uuid
)
select t.status,t.opens_at,t.closes_at,t.attempts_allowed,t.duration_minutes,
 (p.role='student' and p.status='active') as active_student,
 p.college_id=t.college_id as college_matches,
 exists(select 1 from public.class_enrollments e where e.college_id=t.college_id and e.class_id=t.class_id and e.student_id=p.id and e.status='active') as active_enrollment,
 (select count(*) from public.quiz_attempts a where a.college_id=t.college_id and a.quiz_id=t.id and a.student_id=p.id) as submitted_attempts,
 (select jsonb_agg(jsonb_build_object('number',s.attempt_number,'started_at',s.started_at,'expires_at',s.expires_at) order by s.attempt_number)
  from public.quiz_attempt_sessions s where s.college_id=t.college_id and s.quiz_id=t.id and s.student_id=p.id) as existing_sessions
from target t cross join public.profiles p where p.id='STUDENT_UUID'::uuid;

