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
    join public.profiles faculty
      on faculty.id = cf.faculty_id
     and faculty.college_id = cf.college_id
    where c.id = _class_id
      and c.college_id = private.current_college_id()
      and cf.faculty_id = (select auth.uid())
      and cf.can_manage_assignments
      and faculty.role = 'faculty'
      and faculty.status = 'active'
  )
$$;

revoke all on function private.can_manage_class(uuid) from public, anon;
grant execute on function private.can_manage_class(uuid) to authenticated;

alter table public.assignments enable row level security;
grant insert on public.assignments to authenticated;

drop policy if exists "faculty create assignments in assigned classes" on public.assignments;
create policy "faculty create assignments in assigned classes" on public.assignments
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and created_by = (select auth.uid())
  and private.can_manage_class(class_id)
);
