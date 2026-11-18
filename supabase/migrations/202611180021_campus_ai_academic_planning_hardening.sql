-- Storage and server-operation hardening for CampusClass AI planning features.

drop policy if exists "class syllabi faculty insert" on storage.objects;
drop policy if exists "class syllabi members read" on storage.objects;
drop policy if exists "class syllabi faculty update" on storage.objects;
drop policy if exists "class syllabi faculty delete" on storage.objects;

create policy "class syllabi faculty insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and private.safe_uuid(split_part(name, '/', 2)) is not null
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(
      private.current_college_id(),
      private.safe_uuid(split_part(name, '/', 2))
    )
  )
);

create policy "class syllabi members read" on storage.objects
for select to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and private.is_class_member(private.safe_uuid(split_part(name, '/', 2)))
);

create policy "class syllabi faculty update" on storage.objects
for update to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(
      private.current_college_id(),
      private.safe_uuid(split_part(name, '/', 2))
    )
  )
)
with check (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(
      private.current_college_id(),
      private.safe_uuid(split_part(name, '/', 2))
    )
  )
);

create policy "class syllabi faculty delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(
      private.current_college_id(),
      private.safe_uuid(split_part(name, '/', 2))
    )
  )
);
