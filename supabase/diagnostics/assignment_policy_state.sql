-- Read-only diagnosis for Muse BUG-N1. Run on CAMPUS CLASS ONLY in SQL Editor.
-- Output does not include credentials, student records, or passwords.
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('assignments','class_faculty','classes','profiles') order by tablename,policyname;
select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('current_college_id','current_role','can_manage_class','is_admin','is_faculty_in_class');
select has_table_privilege('authenticated','public.assignments','INSERT') as authenticated_insert,has_table_privilege('authenticated','public.class_faculty','SELECT') as authenticated_membership_read;
