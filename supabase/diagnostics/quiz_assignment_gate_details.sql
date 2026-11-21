-- Read-only supplement to Sections A/B of quiz_assignment_live_state.sql.
-- Role ownership matters: BYPASSRLS ignores FORCE RLS even for nonowners.
select c.relname,pg_get_userbyid(c.relowner) as table_owner,
 c.relrowsecurity,c.relforcerowsecurity,r.rolbypassrls,r.rolsuper,
 pg_has_role('service_role',c.relowner,'USAGE') as service_role_has_owner_privileges
from pg_class c cross join pg_roles r
where c.oid in ('public.quiz_attempt_sessions'::regclass,'public.quizzes'::regclass,'public.assignments'::regclass)
  and r.rolname='service_role';
select t.tgname,t.tgtype,t.tgenabled,p.oid::regprocedure as function_name,
 p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as definition
from pg_trigger t join pg_proc p on p.oid=t.tgfoid
where t.tgrelid='public.quiz_attempt_sessions'::regclass and not t.tgisinternal;
select polname,polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid) as using_expr,
 regexp_replace(pg_get_expr(polqual,polrelid),'[\s()]','','g') as normalized_using,
 pg_get_expr(polwithcheck,polrelid) as check_expr
from pg_policy where polrelid='public.assignments'::regclass;
