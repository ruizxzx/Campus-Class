-- Campus Class forward-only migration 039.
-- Run manually in the correct Campus Class Supabase SQL Editor AFTER 038.
-- Never run on a different Supabase project.
-- This preserves all enrollments, submissions, files, grades and invitations.
begin;

do $checks$
begin
  if to_regclass('public.class_enrollments') is null
     or to_regclass('public.submission_attachments') is null then
    raise exception 'Campus Class core migrations must be applied before 039';
  end if;
end
$checks$;

-- Only server-authorized routes may restore a voluntarily LEFT enrollment.
-- The route still verifies the caller is a student of the correct college,
-- has a valid class code and is neither ACTIVE nor REMOVED.
grant select on table public.class_enrollments to service_role;
grant update (status, enrolled_at) on table public.class_enrollments to service_role;

-- An object in the private student-submissions Storage bucket should have
-- exactly one submission metadata owner. Only add this uniqueness guard when
-- the existing dataset is already clean. Never erase or reassign duplicates.
do $index_guard$
begin
  if exists (
    select 1
    from public.submission_attachments
    group by college_id, storage_path
    having count(*) > 1
  ) then
    raise warning '039: Duplicate submission_attachments storage_path values exist. No unique index was added; investigate existing rows before enforcing uniqueness.';
  else
    execute 'create unique index if not exists submission_attachments_college_path_unique
      on public.submission_attachments (college_id, storage_path)';
  end if;
end
$index_guard$;

commit;

-- Read-only checks to run manually after applying 039:
-- select has_column_privilege('service_role','public.class_enrollments','status','UPDATE') as can_restore_left,
--        has_column_privilege('service_role','public.class_enrollments','enrolled_at','UPDATE') as can_update_enrolled_at;
-- select college_id, storage_path, count(*) as references
-- from public.submission_attachments
-- group by college_id, storage_path having count(*) > 1;
-- select to_regclass('public.submission_attachments_college_path_unique') is not null as unique_index_present;
