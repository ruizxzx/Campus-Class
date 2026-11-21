-- CONDITIONAL ONLY: Section A quizzes service_role can_select=false or
-- can_update_any_column=false. Restore only missing 053 privileges.
begin;
do $gate$
begin
  if has_table_privilege('service_role','public.quizzes','SELECT')
    and has_any_column_privilege('service_role','public.quizzes','UPDATE') then
    raise exception '060: server quiz read and row-lock grants already exist';
  end if;
  if not has_table_privilege('service_role','public.quizzes','SELECT') then
    grant select on table public.quizzes to service_role;
  end if;
  if not has_any_column_privilege('service_role','public.quizzes','UPDATE') then
    grant update (status) on table public.quizzes to service_role;
  end if;
end
$gate$;
commit;
