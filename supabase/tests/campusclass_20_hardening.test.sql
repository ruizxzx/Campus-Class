-- Tests for migrations 029 and 030. Execute in a disposable local/staging DB
-- after all forward-only migrations; NEVER create fixtures in production.
begin;
select plan(19);
select ok(to_regclass('public.attendance_correction_audit') is not null, 'correction audit table exists');
select ok((select relrowsecurity from pg_class where oid='public.attendance_correction_audit'::regclass), 'correction audit RLS enabled');
select ok(has_table_privilege('service_role','public.attendance_correction_audit','INSERT'), 'server can create correction events');
select ok(not has_table_privilege('authenticated','public.attendance_correction_audit','INSERT'), 'clients cannot forge correction events');
select ok(exists (select 1 from pg_trigger where tgname='campusclass_attendance_session_clock' and tgenabled<>'D'), 'session creation uses the database clock');
select ok(exists (select 1 from pg_trigger where tgname='campusclass_attendance_record_guard' and tgenabled<>'D'), 'attendance check-in guard is active');
select ok(exists (select 1 from pg_trigger where tgname='campusclass_attendance_correction_audit' and tgenabled<>'D'), 'correction logging is active');
select ok(exists (select 1 from pg_trigger where tgname='campusclass_quiz_attempt_session_guard' and tgenabled<>'D'), 'quiz timer protection is active');
select ok((select prosrc ilike '%clock_timestamp()%' from pg_proc where oid='private.submit_quiz_attempt_guarded(uuid,jsonb)'::regprocedure), 'submission guard checks database wall clock');
select ok(to_regclass('public.ai_request_usage') is not null, 'hourly AI usage table exists');
select ok((select relrowsecurity from pg_class where oid='public.ai_request_usage'::regclass), 'AI usage RLS enabled');
select ok(not has_function_privilege('authenticated','public.consume_ai_request_quota(uuid,uuid)','EXECUTE'), 'AI usage RPC is private to server');
select ok(has_function_privilege('service_role','public.consume_ai_request_quota(uuid,uuid)','EXECUTE'), 'trusted server can enforce quota');
select ok(not has_function_privilege('authenticated','public.submit_quiz_attempt(uuid,jsonb)','EXECUTE'), 'old unguarded quiz grader is revoked');
select ok(has_function_privilege('authenticated','public.submit_quiz_attempt_v2(uuid,jsonb)','EXECUTE'), 'student v2 quiz grader is available');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_interventions' and column_name='action_plan'), 'staff action plans are stored');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_interventions' and column_name='follow_up_at'), 'intervention due dates are stored');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_interventions' and column_name='outcome_note'), 'follow-up outcomes are stored');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_interventions' and column_name='resolved_at'), 'resolved intervention timestamps are stored');
select * from finish();
rollback;
