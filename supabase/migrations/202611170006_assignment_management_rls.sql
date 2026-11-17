create or replace function private.can_manage_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(private.current_college_id()) or exists (
    select 1
    from public.classes c
    join public.class_faculty cf
      on cf.class_id = c.id
     and cf.college_id = c.college_id
    join public.profiles p
      on p.id = cf.faculty_id
     and p.college_id = cf.college_id
    where c.id = _class_id
      and c.college_id = private.current_college_id()
      and cf.faculty_id = (select auth.uid())
      and cf.can_manage_assignments
      and p.role = 'faculty'
      and p.status = 'active'
  )
$$;

grant execute on function private.can_manage_class(uuid) to authenticated;

drop policy if exists "faculty create assignments in assigned classes" on public.assignments;
create policy "faculty create assignments in assigned classes" on public.assignments
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and created_by = (select auth.uid())
  and private.can_manage_class(class_id)
);

drop policy if exists "faculty update own assignments" on public.assignments;
create policy "faculty update own assignments" on public.assignments
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.can_manage_class(class_id))
)
with check (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.can_manage_class(class_id))
);

drop policy if exists "faculty delete own assignments" on public.assignments;
create policy "faculty delete own assignments" on public.assignments
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.can_manage_class(class_id))
);
