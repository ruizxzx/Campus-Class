-- Forward-only: preserve the SQL 029 assessment row lock.
-- SQL 037 grants SELECT; PostgreSQL also requires UPDATE on at least one
-- column for SELECT ... FOR SHARE. Grant only to the trusted server role.
-- No assessment rows, attempts, policies, or browser privileges change.
begin;
grant select on table public.quizzes to service_role;
grant update (status) on table public.quizzes to service_role;
do $check$
begin
  if not has_table_privilege('service_role','public.quizzes','SELECT')
     or not has_column_privilege('service_role','public.quizzes','status','UPDATE') then
    raise exception 'Server assessment row-lock permissions are incomplete.';
  end if;
end
$check$;
commit;
