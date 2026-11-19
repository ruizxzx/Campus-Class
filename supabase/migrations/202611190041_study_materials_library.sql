-- Campus Class 2.0 / 041 — private digital learning library
-- FORWARD ONLY. Manually apply AFTER migration 040 in the Campus Class project.
-- Existing course, submission, stream and Storage data remain untouched.
begin;

create table if not exists public.study_materials (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 class_id uuid not null,
 subject_id uuid not null,
 title text not null check (char_length(title) between 2 and 180),
 description text not null default '',
 semester integer check (semester between 1 and 12),
 unit_title text not null default '',
 chapter_title text not null default '',
 created_by uuid not null,
 status text not null default 'draft' check(status in ('draft','published','archived')),
 current_version integer not null default 1 check(current_version>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(college_id,id),
 foreign key(college_id,class_id) references public.classes(college_id,id) on delete cascade,
 foreign key(college_id,subject_id) references public.subjects(college_id,id) on delete restrict,
 foreign key(college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create table if not exists public.study_material_versions (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 material_id uuid not null,
 version integer not null check(version>=1),
 file_name text not null check(char_length(file_name) between 1 and 255),
 mime_type text not null,
 file_size bigint not null check(file_size between 1 and 31457280),
 storage_path text not null unique,
 extracted_text text not null default '',
 indexed_at timestamptz,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 unique(material_id,version),
 unique(college_id,id),
 foreign key(college_id,material_id) references public.study_materials(college_id,id) on delete cascade,
 foreign key(college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create table if not exists public.study_material_chunks (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 material_id uuid not null,
 version_id uuid not null,
 chunk_index integer not null check(chunk_index between 0 and 1023),
 page_number integer,
 chunk_text text not null check(char_length(chunk_text) between 10 and 3000),
 unique(version_id,chunk_index),
 foreign key(college_id,material_id) references public.study_materials(college_id,id) on delete cascade,
 foreign key(college_id,version_id) references public.study_material_versions(college_id,id) on delete cascade
);
create table if not exists public.study_material_progress (
 college_id uuid not null,
 material_id uuid not null,
 student_id uuid not null,
 last_page integer not null default 1 check(last_page between 1 and 100000),
 status text not null default 'reading' check(status in ('reading','completed')),
 completed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(material_id,student_id),
 foreign key(college_id,material_id) references public.study_materials(college_id,id) on delete cascade,
 foreign key(college_id,student_id) references public.profiles(college_id,id) on delete cascade
);
create table if not exists public.study_material_bookmarks (
 college_id uuid not null,
 material_id uuid not null,
 student_id uuid not null,
 page_number integer not null check(page_number between 1 and 100000),
 note text not null default '' check(char_length(note)<=240),
 created_at timestamptz not null default now(),
 primary key(material_id,student_id,page_number),
 foreign key(college_id,material_id) references public.study_materials(college_id,id) on delete cascade,
 foreign key(college_id,student_id) references public.profiles(college_id,id) on delete cascade
);
create index if not exists study_materials_class_idx on public.study_materials(college_id,class_id,status,created_at desc);
create index if not exists study_material_versions_material_idx on public.study_material_versions(material_id,version desc);
create index if not exists study_material_chunks_search_idx on public.study_material_chunks
 using gin(to_tsvector('english',chunk_text));
create index if not exists study_material_chunks_material_idx on public.study_material_chunks(college_id,material_id,version_id);
create index if not exists study_material_progress_student_idx on public.study_material_progress(college_id,student_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-library','study-library',false,31457280,
 array['application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

-- Never expose the library bucket with public file URLs. Client uploads
-- use short-lived, single-object signed upload tokens created by a staff API.
-- All file previews/downloads use staff/student-authenticated signed URLs.
create or replace function private.can_read_study_material(p_college uuid,p_material uuid)
returns boolean language sql stable security definer set search_path=''
as $body$
 select exists (
  select 1 from public.study_materials m
  where m.id=p_material and m.college_id=p_college
   and p_college=(select private.current_college_id())
   and (
     (m.status='published' and private.can_access_class(m.class_id))
     or private.is_admin(p_college)
     or exists (
       select 1 from public.class_faculty f
       where f.college_id=p_college and f.class_id=m.class_id
         and f.faculty_id=(select auth.uid())
     )
   )
 );
$body$;

alter table public.study_materials enable row level security;
alter table public.study_material_versions enable row level security;
alter table public.study_material_chunks enable row level security;
alter table public.study_material_progress enable row level security;
alter table public.study_material_bookmarks enable row level security;
revoke all on public.study_materials,public.study_material_versions,
 public.study_material_chunks,public.study_material_progress,
 public.study_material_bookmarks from public,anon,authenticated;
grant select on public.study_materials,public.study_material_versions,
 public.study_material_chunks,public.study_material_progress,
 public.study_material_bookmarks to authenticated;
grant select,insert,update,delete on public.study_materials,
 public.study_material_versions,public.study_material_chunks,
 public.study_material_progress,public.study_material_bookmarks to service_role;
grant usage on schema public to service_role;

drop policy if exists "library material visibility" on public.study_materials;
create policy "library material visibility" on public.study_materials
 for select to authenticated using(private.can_read_study_material(college_id,id));
drop policy if exists "library version visibility" on public.study_material_versions;
create policy "library version visibility" on public.study_material_versions
 for select to authenticated using(private.can_read_study_material(college_id,material_id));
drop policy if exists "library chunk visibility" on public.study_material_chunks;
create policy "library chunk visibility" on public.study_material_chunks
 for select to authenticated using(private.can_read_study_material(college_id,material_id));
drop policy if exists "library progress visibility" on public.study_material_progress;
create policy "library progress visibility" on public.study_material_progress
 for select to authenticated using(
  college_id=(select private.current_college_id())
  and (student_id=(select auth.uid()) or private.is_admin(college_id))
);
drop policy if exists "library bookmark visibility" on public.study_material_bookmarks;
create policy "library bookmark visibility" on public.study_material_bookmarks
 for select to authenticated using(
  student_id=(select auth.uid()) and college_id=(select private.current_college_id())
);

-- Signed uploads rely on the server-created token. There is no public
-- INSERT or SELECT policy on the private storage bucket.
commit;

-- Read-only verification:
-- select tablename,rowsecurity from pg_tables where schemaname='public'
-- and tablename like 'study_material%';
-- select id,public,file_size_limit from storage.buckets where id='study-library';
