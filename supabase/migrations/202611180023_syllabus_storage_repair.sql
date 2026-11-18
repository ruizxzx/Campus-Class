-- Ensure the private syllabus bucket and table exist in upgraded projects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-syllabi',
  'class-syllabi',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.class_syllabi (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  created_by uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  file_size bigint not null check (file_size between 1 and 20971520),
  outline_text text not null default '' check (char_length(outline_text) <= 50000),
  created_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create index if not exists class_syllabi_class_created_idx
  on public.class_syllabi(college_id, class_id, created_at desc);

alter table public.class_syllabi enable row level security;
grant select, insert, update, delete on public.class_syllabi to authenticated;

drop policy if exists "class members read syllabi" on public.class_syllabi;
create policy "class members read syllabi" on public.class_syllabi
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.is_class_member(class_id))
);

drop policy if exists "assigned faculty manage syllabi" on public.class_syllabi;
create policy "assigned faculty manage syllabi" on public.class_syllabi
for all to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.is_faculty_in_class(college_id, class_id))
)
with check (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or (created_by = (select auth.uid()) and private.is_faculty_in_class(college_id, class_id))
  )
);

drop policy if exists "class syllabi faculty insert" on storage.objects;
create policy "class syllabi faculty insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and private.safe_uuid(split_part(name, '/', 2)) is not null
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(private.current_college_id(), private.safe_uuid(split_part(name, '/', 2)))
  )
);

drop policy if exists "class syllabi members read" on storage.objects;
create policy "class syllabi members read" on storage.objects
for select to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and private.is_class_member(private.safe_uuid(split_part(name, '/', 2)))
);

drop policy if exists "class syllabi faculty update" on storage.objects;
create policy "class syllabi faculty update" on storage.objects
for update to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(private.current_college_id(), private.safe_uuid(split_part(name, '/', 2)))
  )
)
with check (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(private.current_college_id(), private.safe_uuid(split_part(name, '/', 2)))
  )
);

drop policy if exists "class syllabi faculty delete" on storage.objects;
create policy "class syllabi faculty delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'class-syllabi'
  and split_part(name, '/', 1) = (select private.current_college_id())::text
  and (
    private.is_admin(private.current_college_id())
    or private.is_faculty_in_class(private.current_college_id(), private.safe_uuid(split_part(name, '/', 2)))
  )
);
