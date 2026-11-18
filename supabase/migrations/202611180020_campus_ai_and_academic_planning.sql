-- College-scoped AI configuration, classroom syllabi, recurring schedules and projects.

create table if not exists public.college_ai_settings (
  college_id uuid primary key references public.colleges(id) on delete cascade,
  enabled boolean not null default false,
  model text not null default 'openai/gpt-4o-mini'
    check (char_length(model) between 3 and 120),
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (
    (api_key_ciphertext is null and api_key_iv is null and api_key_tag is null)
    or (api_key_ciphertext is not null and api_key_iv is not null and api_key_tag is not null)
  ),
  foreign key (college_id, updated_by) references public.profiles(college_id, id) on delete restrict
);

alter table public.college_ai_settings enable row level security;
revoke all on public.college_ai_settings from public, anon, authenticated;
grant select, insert, update, delete on public.college_ai_settings to service_role;

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

create policy "class members read syllabi" on public.class_syllabi for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.is_class_member(class_id))
);
create policy "assigned faculty manage syllabi" on public.class_syllabi for all to authenticated
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

create table if not exists public.class_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  created_by uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text check (location is null or char_length(location) <= 180),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  unique (class_id, weekday, start_time),
  check (end_time > start_time),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create index if not exists class_schedule_weekday_idx
  on public.class_schedule_entries(college_id, weekday, start_time);
alter table public.class_schedule_entries enable row level security;
grant select, insert, update, delete on public.class_schedule_entries to authenticated;

create policy "class members read schedule" on public.class_schedule_entries for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.is_class_member(class_id))
);
create policy "assigned faculty manage schedule" on public.class_schedule_entries for all to authenticated
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

alter table public.assignments
  add column if not exists work_type text not null default 'assignment'
  check (work_type in ('assignment', 'project'));
create index if not exists assignments_project_class_idx
  on public.assignments(college_id, class_id, due_at)
  where work_type = 'project' and status = 'published';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-syllabi', 'class-syllabi', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Syllabus objects are read through short-lived server-generated signed URLs only.
