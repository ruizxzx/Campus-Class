-- Assignment creation returns the inserted row through the authenticated Data API.
-- Row visibility remains restricted by the assignments SELECT policy.
grant select, insert on public.assignments to authenticated;

drop policy if exists "members read class assignments" on public.assignments;
create policy "members read class assignments" on public.assignments
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.can_access_assignment(id)
    or private.can_manage_class(class_id)
  )
);
