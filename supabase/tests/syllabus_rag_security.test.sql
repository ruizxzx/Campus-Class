-- Execute ONLY in disposable Supabase/staging after ordered migrations through 036.
-- Read-only pgTAP security/availability assertions; do not run in production.
begin;
select plan(10);
select ok(to_regclass('public.syllabus_text_chunks') is not null,'private PDF text index exists');
select ok((select relrowsecurity from pg_class where oid='public.syllabus_text_chunks'::regclass),'PDF chunks have RLS');
select ok(has_table_privilege('service_role','public.syllabus_text_chunks','INSERT'),'server can store text');
select ok(not has_table_privilege('authenticated','public.syllabus_text_chunks','SELECT'),'students cannot read raw vectors or chunks');
select ok(not has_table_privilege('anon','public.syllabus_text_chunks','SELECT'),'anonymous users cannot read raw chunks');
select ok(has_function_privilege('service_role','public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer)','EXECUTE'),'server can retrieve authorized chunks');
select ok(not has_function_privilege('authenticated','public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer)','EXECUTE'),'students cannot invoke definer search directly');
select ok(not has_function_privilege('anon','public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer)','EXECUTE'),'anonymous users cannot invoke definer search');
select ok(not has_function_privilege('authenticated','public.replace_syllabus_text_chunks(uuid,uuid,uuid,jsonb)','EXECUTE'),'authenticated clients cannot forge indexes');
select ok((select prosrc ilike '%class_enrollments%' from pg_proc
  where oid='public.match_syllabus_text_chunks(uuid,uuid,extensions.vector,integer)'::regprocedure),
  'retrieval also checks active class enrollment');
select * from finish();
rollback;
