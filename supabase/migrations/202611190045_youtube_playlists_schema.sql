-- Campus Class 2.0 — 045: durable YouTube playlist imports and watch evidence
-- Forward-only, apply MANUALLY after SQL 044 in the correct college Supabase project.
-- This does NOT change or delete existing courses, lessons, progress, certificates.
begin;
create table if not exists public.youtube_import_jobs (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 created_by uuid not null,
 subject_id uuid not null,
 target_course_id uuid,
 playlist_id varchar(64) not null check (playlist_id ~ '^[A-Za-z0-9_-]{10,64}$'),
 batch_id uuid not null default gen_random_uuid(),
 idempotency_key varchar(96) not null,
 mode text not null default 'import' check (mode in ('import','sync')),
 grouping text not null default 'sequential' check (grouping in ('sequential','rule','ai')),
 status text not null default 'queued' check (status in ('queued','processing','review','applying','applied','failed','cancelled')),
 playlist_title text,
 playlist_description text,
 playlist_thumbnail text,
 expected_count integer not null default 0 check(expected_count>=0),
 processed_count integer not null default 0 check(processed_count>=0),
 next_page_token text,
 attempts integer not null default 0 check(attempts between 0 and 10),
 lock_expires_at timestamptz,
 failure_code text,
 failure_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(college_id,id),
 unique(college_id,created_by,idempotency_key),
 foreign key(college_id,created_by) references public.profiles(college_id,id) on delete cascade,
 foreign key(college_id,subject_id) references public.subjects(college_id,id) on delete restrict,
 foreign key(college_id,target_course_id) references public.courses(college_id,id) on delete set null(target_course_id)
);
create table if not exists public.youtube_import_items (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 job_id uuid not null,
 playlist_position integer not null check(playlist_position>=0),
 video_id varchar(32),
 title text not null default '',
 description text not null default '',
 thumbnail_url text,
 duration_seconds integer not null default 0 check(duration_seconds between 0 and 864000),
 availability text not null default 'available'
   check(availability in ('available','private','deleted','unembeddable','unavailable')),
 selected boolean not null default true,
 fetched_at timestamptz not null default now(),
 unique(job_id,playlist_position),
 unique(college_id,id),
 foreign key(college_id,job_id) references public.youtube_import_jobs(college_id,id) on delete cascade
);
create table if not exists public.youtube_playlist_sources (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 course_id uuid not null,
 playlist_id varchar(64) not null,
 title text,
 automatic_additions boolean not null default false,
 sync_enabled boolean not null default false,
 last_checked_at timestamptz,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 unique(college_id,id),
 unique(college_id,course_id,playlist_id),
 foreign key(college_id,course_id) references public.courses(college_id,id) on delete cascade,
 foreign key(college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create table if not exists public.youtube_lesson_sources (
 college_id uuid not null,
 course_id uuid not null,
 lesson_id uuid not null,
 source_id uuid not null,
 video_id varchar(32) not null,
 playlist_position integer not null,
 duration_seconds integer not null check(duration_seconds between 1 and 864000),
 metadata_edited boolean not null default false,
 removed_from_playlist_at timestamptz,
 synced_at timestamptz not null default now(),
 primary key(lesson_id),
 unique(college_id,course_id,video_id),
 foreign key(college_id,course_id) references public.courses(college_id,id) on delete cascade,
 foreign key(college_id,lesson_id) references public.course_lessons(college_id,id) on delete cascade,
 foreign key(college_id,source_id) references public.youtube_playlist_sources(college_id,id) on delete cascade
);
create table if not exists public.youtube_watch_progress (
 college_id uuid not null,
 student_id uuid not null,
 lesson_id uuid not null,
 course_id uuid not null,
 duration_seconds integer not null check(duration_seconds between 1 and 864000),
 watched_ranges int4multirange not null default '{}'::int4multirange,
 watched_seconds integer not null default 0 check(watched_seconds>=0),
 position_seconds integer not null default 0 check(position_seconds>=0),
 percent numeric(6,2) not null default 0 check(percent between 0 and 100),
 completed_at timestamptz,
 last_activity_at timestamptz not null default now(),
 primary key(student_id,lesson_id),
 foreign key(college_id,student_id) references public.profiles(college_id,id) on delete cascade,
 foreign key(college_id,lesson_id) references public.course_lessons(college_id,id) on delete cascade,
 foreign key(college_id,course_id) references public.courses(college_id,id) on delete cascade
);
create table if not exists public.youtube_watch_sessions (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 student_id uuid not null,
 lesson_id uuid not null,
 last_position numeric(12,2) not null default 0,
 last_state integer not null default 2,
 last_rate numeric(4,2) not null default 1,
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '3 hours',
 created_at timestamptz not null default now(),
 unique(college_id,id),
 foreign key(college_id,student_id) references public.profiles(college_id,id) on delete cascade,
 foreign key(college_id,lesson_id) references public.course_lessons(college_id,id) on delete cascade
);
create table if not exists public.youtube_course_requirements (
 college_id uuid not null,
 course_id uuid primary key,
 watched_threshold integer not null default 90 check(watched_threshold between 60 and 100),
 required_quiz_id uuid,
 required_assignment_id uuid,
 faculty_approval_required boolean not null default false,
 foreign key(college_id,course_id) references public.courses(college_id,id) on delete cascade,
 foreign key(college_id,required_quiz_id) references public.quizzes(college_id,id) on delete set null,
 foreign key(college_id,required_assignment_id) references public.assignments(college_id,id) on delete set null
);
create table if not exists public.youtube_course_approvals (
 college_id uuid not null,
 course_id uuid not null,
 student_id uuid not null,
 approved_by uuid not null,
 approved_at timestamptz not null default now(),
 primary key(course_id,student_id),
 foreign key(college_id,course_id) references public.courses(college_id,id) on delete cascade,
 foreign key(college_id,student_id) references public.profiles(college_id,id) on delete cascade,
 foreign key(college_id,approved_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists youtube_jobs_pending_idx on public.youtube_import_jobs(status,lock_expires_at,created_at);
create index if not exists youtube_jobs_college_idx on public.youtube_import_jobs(college_id,created_by,created_at desc);
create index if not exists youtube_items_job_idx on public.youtube_import_items(job_id,playlist_position);
create index if not exists youtube_sources_course_idx on public.youtube_lesson_sources(college_id,course_id);
create index if not exists youtube_watch_course_idx on public.youtube_watch_progress(college_id,course_id,student_id);

-- Frontend may see ONLY its own jobs and its own course video progress.
-- All import mutations and official API calls use server-only service_role.
do $rls$ declare table_name text;
begin
 foreach table_name in array array[
 'youtube_import_jobs','youtube_import_items','youtube_playlist_sources',
 'youtube_lesson_sources','youtube_watch_progress','youtube_watch_sessions',
 'youtube_course_requirements','youtube_course_approvals'
 ] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);
  execute format('grant select,insert,update,delete on public.%I to service_role',table_name);
 end loop;
end $rls$;
grant select on public.youtube_watch_progress,public.youtube_import_jobs,
 public.youtube_import_items,public.youtube_lesson_sources,public.youtube_playlist_sources,
 public.youtube_course_requirements to authenticated;

drop policy if exists "playlist job owner reads" on public.youtube_import_jobs;
create policy "playlist job owner reads" on public.youtube_import_jobs
 for select to authenticated using(
 college_id=(select private.current_college_id()) and created_by=(select auth.uid()));
drop policy if exists "playlist item owner reads" on public.youtube_import_items;
create policy "playlist item owner reads" on public.youtube_import_items
 for select to authenticated using(
 exists(select 1 from public.youtube_import_jobs j where j.id=job_id and
 j.college_id=college_id and j.created_by=(select auth.uid())));
drop policy if exists "student watch reads" on public.youtube_watch_progress;
create policy "student watch reads" on public.youtube_watch_progress
 for select to authenticated using(
 college_id=(select private.current_college_id()) and student_id=(select auth.uid()));
drop policy if exists "course source college reads" on public.youtube_lesson_sources;
create policy "course source college reads" on public.youtube_lesson_sources
 for select to authenticated using(
 college_id=(select private.current_college_id()) and exists(
 select 1 from public.courses c where c.id=course_id and c.college_id=college_id));
drop policy if exists "playlist sources college reads" on public.youtube_playlist_sources;
create policy "playlist sources college reads" on public.youtube_playlist_sources
 for select to authenticated using(college_id=(select private.current_college_id()));
drop policy if exists "course requirements college reads" on public.youtube_course_requirements;
create policy "course requirements college reads" on public.youtube_course_requirements
 for select to authenticated using(college_id=(select private.current_college_id()));
-- Explicitly no public write policies, no watch session SELECT policies.
commit;
