-- Structural pgTAP checks for migrations 032–037 (run ONLY on disposable staging).
-- These assert grant/constraint presence, not live behavioral tenant isolation.
-- Apply all forward patches first. No application data is mutated by this file.
begin;
select plan(26);
select ok(to_regclass('public.question_bank_items') is not null, 'question bank storage exists');
select ok((select relrowsecurity from pg_class where oid='public.question_bank_items'::regclass), 'question bank RLS on');
select ok(not has_table_privilege('authenticated','public.question_bank_items','SELECT'), 'students cannot query answer bank directly');
select ok(has_table_privilege('service_role','public.question_bank_items','SELECT'), 'staff API service can query answer bank');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='college_ai_settings' and column_name='api_key_vault_id'), 'new AI Vault column is present');
select ok(to_regclass('vault.decrypted_secrets') is not null, 'Supabase Vault decrypted view exists');
select ok(has_function_privilege('service_role','public.read_college_ai_secret(uuid,uuid)','EXECUTE'), 'AI Vault read restricted to server');
select ok(not has_function_privilege('authenticated','public.read_college_ai_secret(uuid,uuid)','EXECUTE'), 'browser roles cannot execute AI Vault read');
select ok(not has_function_privilege('authenticated','public.set_college_ai_secret(uuid,uuid,text,text,boolean)','EXECUTE'), 'browser roles cannot write Vault via admin RPC');
select ok(to_regclass('public.class_gradebook_policies') is not null, 'grading policy storage exists');
select ok((select relrowsecurity from pg_class where oid='public.class_gradebook_policies'::regclass), 'grading policy table RLS enabled');
select ok(not has_table_privilege('authenticated','public.class_gradebook_policies','UPDATE'), 'policy updates restricted to validated service route');
select ok(to_regclass('public.student_success_rules') is not null, 'college Student Success rules exist');
select ok((select relrowsecurity from pg_class where oid='public.student_success_rules'::regclass), 'Student Success rule RLS enabled');
select ok(not has_table_privilege('authenticated','public.student_success_rules','UPDATE'), 'client cannot alter college thresholds');
select ok(to_regprocedure('public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)') is not null, 'atomic course save RPC exists');
select ok(has_function_privilege('service_role','public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)','EXECUTE'), 'service can execute atomic course save');
select ok(not has_function_privilege('authenticated','public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)','EXECUTE'), 'browser cannot call atomic course RPC');
select ok((select prosrc ilike '%p_expected_updated_at is distinct from v_current_updated_at%' from pg_proc where oid='public.save_course_curriculum(uuid,uuid,text,uuid,uuid,text,text,jsonb,boolean,timestamptz)'::regprocedure), 'atomic course save enforces revision concurrency');
select ok(to_regclass('public.ai_study_exchanges') is not null, 'private Copilot exchange history table exists');
select ok((select relrowsecurity from pg_class where oid='public.ai_study_exchanges'::regclass), 'Copilot exchange RLS enabled');
select ok(not has_table_privilege('authenticated','public.ai_study_exchanges','SELECT'), 'browser cannot query other students'' history');
select ok(has_table_privilege('service_role','public.ai_study_exchanges','INSERT'), 'server can save private Copilot exchanges');
select ok(has_table_privilege('service_role','public.ai_study_exchanges','DELETE'), 'server can clear own Copilot exchanges');
select ok(exists(select 1 from pg_constraint where conrelid='public.ai_study_exchanges'::regclass and contype='u' and conname='ai_study_exchanges_college_id_student_id_request_id_key'), 'Copilot retry request IDs are unique per student and college');
select ok(not has_function_privilege('authenticated','public.consume_ai_request_quota(uuid,uuid)','EXECUTE'), 'AI quota RPC denied to browser roles');
select * from finish();
rollback;
