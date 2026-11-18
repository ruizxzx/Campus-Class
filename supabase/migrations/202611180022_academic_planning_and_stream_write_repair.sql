-- Repair the timetable table/policies and keep stream posting tenant-safe.

create table if not exists public.class_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  created_by uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  notes text,
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

drop policy if exists "class members read schedule" on public.class_schedule_entries;
create policy "class members read schedule" on public.class_schedule_entries
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (private.is_admin(college_id) or private.is_class_member(class_id))
);

drop policy if exists "assigned faculty manage schedule" on public.class_schedule_entries;
create policy "assigned faculty manage schedule" on public.class_schedule_entries
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
