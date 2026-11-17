-- CampusClass core schema. Apply with: supabase db push (after linking a Supabase project).
-- All tenant-owned rows carry college_id and cross-tenant relations use composite foreign keys.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 140),
  slug text not null unique,
  email text,
  phone text,
  website text,
  address text,
  logo_path text,
  timezone text not null default 'Asia/Kolkata',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  college_id uuid references public.colleges(id) on delete cascade,
  role text not null check (role in ('admin','faculty','student')),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null,
  phone text,
  avatar_path text,
  status text not null default 'active' check (status in ('active','inactive','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id)
);

create table if not exists public.college_invitations (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  email text not null,
  role text not null check (role in ('faculty','student')),
  full_name text,
  token_hash text not null unique,
  invited_by uuid not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (college_id, invited_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text not null check (char_length(code) between 2 and 20),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  department_id uuid not null,
  name text not null check (char_length(name) between 2 and 140),
  code text not null check (char_length(code) between 2 and 24),
  semester integer check (semester between 1 and 12),
  academic_year text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, department_id) references public.departments(college_id, id) on delete restrict
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  subject_id uuid not null,
  section text not null default 'A' check (char_length(section) between 1 and 16),
  academic_year text not null,
  semester integer not null check (semester between 1 and 12),
  display_name text,
  is_active boolean not null default true,
  enrollment_open boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  unique (college_id, subject_id, section, academic_year),
  foreign key (college_id, subject_id) references public.subjects(college_id, id) on delete restrict,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.class_faculty (
  college_id uuid not null,
  class_id uuid not null,
  faculty_id uuid not null,
  can_manage_assignments boolean not null default false,
  assigned_at timestamptz not null default now(),
  primary key (class_id, faculty_id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, faculty_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  enrolled_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','left','removed')),
  unique (class_id, student_id),
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  code_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  created_by uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  description text,
  instructions text,
  issue_at timestamptz not null default now(),
  due_at timestamptz,
  max_marks numeric(8,2) not null default 100 check (max_marks > 0),
  allow_late boolean not null default false,
  allow_resubmission boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.assignment_attachments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  assignment_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size between 0 and 31457280),
  created_at timestamptz not null default now(),
  foreign key (college_id, assignment_id) references public.assignments(college_id, id) on delete cascade
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  version integer not null check (version > 0),
  text_answer text,
  status text not null default 'submitted' check (status in ('submitted','late','evaluated','returned')),
  submitted_at timestamptz not null default now(),
  unique (assignment_id, student_id, version),
  unique (college_id, id),
  foreign key (college_id, assignment_id) references public.assignments(college_id, id) on delete cascade,
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.assignment_evaluations (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  submission_id uuid not null,
  marks numeric(8,2) not null check (marks >= 0),
  feedback text,
  evaluated_by uuid not null,
  evaluated_at timestamptz not null default now(),
  released_at timestamptz,
  unique (college_id, submission_id),
  foreign key (college_id, submission_id) references public.assignment_submissions(college_id, id) on delete cascade,
  foreign key (college_id, evaluated_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.submission_attachments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  submission_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size between 0 and 31457280),
  created_at timestamptz not null default now(),
  foreign key (college_id, submission_id) references public.assignment_submissions(college_id, id) on delete cascade
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  author_id uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, author_id) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  reference_key text,
  created_at timestamptz not null default now(),
  unique (user_id, reference_key),
  foreign key (college_id, user_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (college_id, actor_id) references public.profiles(college_id, id) on delete set null (actor_id)
);

-- Timestamp maintenance.
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['colleges','profiles','departments','subjects','classes','assignments','announcements'] LOOP
    EXECUTE format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    EXECUTE format('create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
  END LOOP;
END $$;

-- A self-service signup can only create a brand-new college and its first administrator.
-- User metadata is never trusted for assigning faculty/student roles or selecting an existing college.
create or replace function private.bootstrap_college_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_college_id uuid;
  v_college_name text;
  v_full_name text;
  v_slug text;
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_kind', '') <> 'college_admin' then
    return new;
  end if;

  v_college_name := nullif(trim(new.raw_user_meta_data ->> 'college_name'), '');
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if v_college_name is null or v_full_name is null then
    raise exception 'College name and administrator name are required';
  end if;

  v_slug := regexp_replace(lower(v_college_name), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  v_slug := left(coalesce(nullif(v_slug, ''), 'college'), 35) || '-' || lower(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.colleges(name, slug, email)
  values (left(v_college_name, 140), v_slug, lower(new.email))
  returning id into v_college_id;

  insert into public.profiles(id, college_id, role, full_name, email)
  values (new.id, v_college_id, 'admin', left(v_full_name, 120), lower(new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bootstrap_college on auth.users;
create trigger on_auth_user_created_bootstrap_college
after insert on auth.users
for each row execute function private.bootstrap_college_admin();

-- Authorization helpers. These live in a non-exposed schema and are narrowly scoped to auth.uid().
create or replace function private.current_college_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.college_id from public.profiles p where p.id = (select auth.uid()) and p.status = 'active'
$$;

create or replace function private.current_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.status = 'active'
$$;

create or replace function private.is_admin(_college_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.college_id = _college_id and p.role = 'admin' and p.status = 'active')
$$;

create or replace function private.is_faculty_in_class(_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_faculty cf
    join public.profiles p on p.id = cf.faculty_id and p.college_id = cf.college_id
    where cf.class_id = _class_id and cf.faculty_id = (select auth.uid()) and p.role = 'faculty' and p.status = 'active'
  )
$$;

create or replace function private.is_enrolled_in_class(_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_enrollments ce
    join public.profiles p on p.id = ce.student_id and p.college_id = ce.college_id
    where ce.class_id = _class_id and ce.student_id = (select auth.uid()) and ce.status = 'active' and p.role = 'student' and p.status = 'active'
  )
$$;

create or replace function private.can_manage_class(_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin(private.current_college_id()) or exists (
    select 1 from public.class_faculty cf
    join public.profiles p on p.id = cf.faculty_id and p.college_id = cf.college_id
    where cf.class_id = _class_id and cf.faculty_id = (select auth.uid()) and cf.can_manage_assignments
      and p.role = 'faculty' and p.status = 'active'
  )
$$;

create or replace function private.assignment_belongs_to_class(_class_id uuid, _assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = _assignment_id and a.class_id = _class_id and a.college_id = private.current_college_id()
  )
$$;

create or replace function private.can_access_class(_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes c where c.id = _class_id and c.college_id = private.current_college_id())
    and (private.is_admin(private.current_college_id()) or private.is_faculty_in_class(_class_id) or private.is_enrolled_in_class(_class_id))
$$;

create or replace function private.can_access_assignment(_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = _assignment_id and a.college_id = private.current_college_id()
      and (private.is_admin(a.college_id) or private.is_faculty_in_class(a.class_id)
        or (a.status = 'published' and private.is_enrolled_in_class(a.class_id)))
  )
$$;

create or replace function private.safe_uuid(_value text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return _value::uuid;
exception when others then
  return null;
end;
$$;

-- A signed-in user can view profiles only within their college and where an academic relationship exists.
create or replace function private.can_view_profile(_target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles target
    where target.id = _target_user and target.college_id = private.current_college_id()
      and (
        target.id = (select auth.uid())
        or private.is_admin(target.college_id)
        or exists (
          select 1 from public.class_enrollments ce
          join public.class_faculty cf on cf.class_id = ce.class_id and cf.college_id = ce.college_id
          where ce.student_id = target.id and cf.faculty_id = (select auth.uid()) and ce.status = 'active'
        )
        or exists (
          select 1 from public.class_faculty cf
          join public.class_enrollments ce on ce.class_id = cf.class_id and ce.college_id = cf.college_id
          where cf.faculty_id = target.id and ce.student_id = (select auth.uid()) and ce.status = 'active'
        )
      )
  )
$$;

-- Explicitly expose only the application operations used by authenticated clients.
-- Table grants and RLS are independent controls. No anonymous app-table access is granted.
revoke all on table
  public.colleges, public.profiles, public.college_invitations, public.departments, public.subjects,
  public.classes, public.class_faculty, public.class_enrollments, public.enrollment_codes,
  public.assignments, public.assignment_attachments, public.assignment_submissions,
  public.assignment_evaluations, public.submission_attachments, public.announcements,
  public.notifications, public.activity_logs
from anon, authenticated;
grant usage on schema public to authenticated;
grant select, update on public.colleges to authenticated;
grant select on public.profiles to authenticated;
revoke select on public.college_invitations from authenticated;
grant select (id, college_id, email, role, full_name, invited_by, expires_at, accepted_at, created_at)
  on public.college_invitations to authenticated;
grant select, insert, update, delete on public.departments, public.subjects, public.classes,
  public.class_faculty, public.assignments, public.assignment_attachments, public.announcements to authenticated;
grant select, delete on public.class_enrollments to authenticated;
grant select on public.assignment_submissions, public.assignment_evaluations,
  public.submission_attachments, public.notifications, public.activity_logs to authenticated;
-- Enrollment hashes and privileged writes are available only to server-side operations.
revoke all on public.enrollment_codes from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.college_invitations from anon, authenticated;
revoke insert, update, delete on public.assignment_submissions from anon, authenticated;
revoke insert, update, delete on public.submission_attachments from anon, authenticated;
revoke insert, update, delete on public.assignment_evaluations from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;
revoke insert, update, delete on public.activity_logs from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Private helper execution is granted only to authenticated clients; functions still validate auth.uid().
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.current_college_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_faculty_in_class(uuid) to authenticated;
grant execute on function private.is_enrolled_in_class(uuid) to authenticated;
grant execute on function private.can_manage_class(uuid) to authenticated;
grant execute on function private.assignment_belongs_to_class(uuid,uuid) to authenticated;
grant execute on function private.can_access_class(uuid) to authenticated;
grant execute on function private.can_access_assignment(uuid) to authenticated;
grant execute on function private.safe_uuid(text) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

-- Enable RLS on every application table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'colleges','profiles','college_invitations','departments','subjects','classes','class_faculty',
    'class_enrollments','enrollment_codes','assignments','assignment_attachments','assignment_submissions','assignment_evaluations',
    'submission_attachments','announcements','notifications','activity_logs'
  ] LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
  END LOOP;
END $$;

-- Colleges and profiles.
create policy "college members read own college" on public.colleges for select to authenticated
using (id = (select private.current_college_id()));
create policy "college admins update own college" on public.colleges for update to authenticated
using (private.is_admin(id)) with check (private.is_admin(id));

create policy "users read permitted profiles" on public.profiles for select to authenticated
using (private.can_view_profile(id));

create policy "admins read invitations" on public.college_invitations for select to authenticated
using (private.is_admin(college_id));

-- Academic catalogue.
create policy "college users read departments" on public.departments for select to authenticated
using (college_id = (select private.current_college_id()));
create policy "admins manage departments" on public.departments for all to authenticated
using (private.is_admin(college_id)) with check (private.is_admin(college_id));

create policy "college users read subjects" on public.subjects for select to authenticated
using (college_id = (select private.current_college_id()));
create policy "admins manage subjects" on public.subjects for all to authenticated
using (private.is_admin(college_id)) with check (private.is_admin(college_id));

create policy "members read accessible classes" on public.classes for select to authenticated
using (college_id = (select private.current_college_id()) and private.can_access_class(id));
create policy "admins manage classes" on public.classes for all to authenticated
using (private.is_admin(college_id)) with check (private.is_admin(college_id));

create policy "class faculty see assignments" on public.class_faculty for select to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or faculty_id = (select auth.uid()) or private.is_faculty_in_class(class_id)));
create policy "students see faculty in joined classes" on public.class_faculty for select to authenticated
using (college_id = (select private.current_college_id()) and exists (
  select 1 from public.class_enrollments ce where ce.class_id = class_faculty.class_id and ce.college_id = class_faculty.college_id and ce.student_id = (select auth.uid()) and ce.status = 'active'
));
create policy "admins manage class faculty" on public.class_faculty for all to authenticated
using (private.is_admin(college_id)) with check (private.is_admin(college_id));

create policy "members view relevant roster" on public.class_enrollments for select to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or student_id = (select auth.uid()) or private.is_faculty_in_class(class_id)));
create policy "admins or students leave enrollment" on public.class_enrollments for delete to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or student_id = (select auth.uid())));

-- Enrollment codes are intentionally not reachable via the Data API. Only server routes using a server-only key access them.

-- Assignments.
create policy "members read class assignments" on public.assignments for select to authenticated
using (college_id = (select private.current_college_id()) and private.can_access_assignment(id));
create policy "faculty create assignments in assigned classes" on public.assignments for insert to authenticated
with check (college_id = (select private.current_college_id()) and created_by = (select auth.uid()) and private.can_manage_class(class_id));
create policy "faculty update own assignments" on public.assignments for update to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or private.can_manage_class(class_id)))
with check (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or private.can_manage_class(class_id)));
create policy "faculty delete own assignments" on public.assignments for delete to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or private.can_manage_class(class_id)));

create policy "members read assignment attachments" on public.assignment_attachments for select to authenticated
using (college_id = (select private.current_college_id()) and private.can_access_assignment(assignment_id));
create policy "faculty manage assignment attachments" on public.assignment_attachments for all to authenticated
using (college_id = (select private.current_college_id()) and exists (
  select 1 from public.assignments a where a.id = assignment_attachments.assignment_id and a.college_id = assignment_attachments.college_id
    and (private.is_admin(a.college_id) or private.can_manage_class(a.class_id))
))
with check (college_id = (select private.current_college_id()) and exists (
  select 1 from public.assignments a where a.id = assignment_attachments.assignment_id and a.college_id = assignment_attachments.college_id
    and (private.is_admin(a.college_id) or private.can_manage_class(a.class_id))
));

-- Submission rows can only be written through authenticated server routes, so students cannot tamper with marks or timestamps.
create policy "students and assigned faculty read submissions" on public.assignment_submissions for select to authenticated
using (college_id = (select private.current_college_id()) and (
  private.is_admin(college_id) or student_id = (select auth.uid()) or exists (
    select 1 from public.assignments a where a.id = assignment_id and private.is_faculty_in_class(a.class_id)
  )
));
create policy "view released or authorized evaluations" on public.assignment_evaluations for select to authenticated
using (college_id = (select private.current_college_id()) and (
  private.is_admin(college_id)
  or exists (select 1 from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id where s.id = submission_id and private.is_faculty_in_class(a.class_id))
  or (released_at is not null and exists (select 1 from public.assignment_submissions s where s.id = submission_id and s.student_id = (select auth.uid())))
));

create policy "read attachments for visible submissions" on public.submission_attachments for select to authenticated
using (college_id = (select private.current_college_id()) and exists (
  select 1 from public.assignment_submissions s where s.id = submission_attachments.submission_id and s.college_id = submission_attachments.college_id
));

-- Announcements.
create policy "members read class announcements" on public.announcements for select to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or private.is_faculty_in_class(class_id) or private.is_enrolled_in_class(class_id)));
create policy "faculty create announcements" on public.announcements for insert to authenticated
with check (college_id = (select private.current_college_id()) and author_id = (select auth.uid()) and (private.is_admin(college_id) or private.is_faculty_in_class(class_id)));
create policy "faculty update own announcements" on public.announcements for update to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or (author_id = (select auth.uid()) and private.is_faculty_in_class(class_id))))
with check (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or (author_id = (select auth.uid()) and private.is_faculty_in_class(class_id))));
create policy "faculty delete own announcements" on public.announcements for delete to authenticated
using (college_id = (select private.current_college_id()) and (private.is_admin(college_id) or (author_id = (select auth.uid()) and private.is_faculty_in_class(class_id))));

-- Notifications and activity.
create policy "users read own notifications" on public.notifications for select to authenticated
using (college_id = (select private.current_college_id()) and user_id = (select auth.uid()));
create policy "users mark own notifications read" on public.notifications for update to authenticated
using (college_id = (select private.current_college_id()) and user_id = (select auth.uid()))
with check (college_id = (select private.current_college_id()) and user_id = (select auth.uid()));
create policy "admins read activity" on public.activity_logs for select to authenticated
using (private.is_admin(college_id));

-- Useful indexes for tenant filters, joins, RLS predicates and dashboard queries.
create unique index if not exists profiles_college_email_lower_uidx on public.profiles(college_id, lower(email));
create unique index if not exists departments_college_name_lower_uidx on public.departments(college_id, lower(name));
create unique index if not exists departments_college_code_upper_uidx on public.departments(college_id, upper(code));
create unique index if not exists subjects_college_code_upper_uidx on public.subjects(college_id, upper(code));
create index if not exists profiles_college_role_idx on public.profiles(college_id, role, status);
create index if not exists invitations_college_email_idx on public.college_invitations(college_id, lower(email));
create index if not exists departments_college_active_idx on public.departments(college_id, is_active);
create index if not exists subjects_college_department_idx on public.subjects(college_id, department_id);
create index if not exists classes_college_subject_idx on public.classes(college_id, subject_id);
create index if not exists class_faculty_user_idx on public.class_faculty(faculty_id, class_id);
create index if not exists class_enrollments_student_idx on public.class_enrollments(student_id, status);
create index if not exists assignments_class_due_idx on public.assignments(class_id, status, due_at);
create index if not exists evaluations_release_idx on public.assignment_evaluations(college_id, released_at);
create index if not exists submissions_student_idx on public.assignment_submissions(student_id, submitted_at desc);
create index if not exists submissions_assignment_idx on public.assignment_submissions(assignment_id, status);
create index if not exists announcements_class_published_idx on public.announcements(class_id, published_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_reference_key_idx on public.notifications(user_id, reference_key) where reference_key is not null;
create index if not exists activity_college_created_idx on public.activity_logs(college_id, created_at desc);

-- Private storage buckets. All buckets remain non-public.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('assignment-references','assignment-references',false,31457280,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','text/plain']),
  ('student-submissions','student-submissions',false,31457280,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','text/plain']),
  ('profile-images','profile-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage object paths: college/class/assignment/... and college/class/assignment/student/... .
create policy "read class assignment reference files" on storage.objects for select to authenticated
using (
  bucket_id = 'assignment-references'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and private.can_access_assignment(private.safe_uuid((storage.foldername(name))[3]))
);
create policy "faculty upload assignment reference files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'assignment-references'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and private.can_manage_class(private.safe_uuid((storage.foldername(name))[2]))
);
create policy "faculty delete assignment reference files" on storage.objects for delete to authenticated
using (
  bucket_id = 'assignment-references'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and private.can_manage_class(private.safe_uuid((storage.foldername(name))[2]))
);

create policy "read permitted student submission files" on storage.objects for select to authenticated
using (
  bucket_id = 'student-submissions'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and (
    private.is_admin((select private.current_college_id()))
    or private.is_faculty_in_class(private.safe_uuid((storage.foldername(name))[2]))
    or (private.safe_uuid((storage.foldername(name))[4]) = (select auth.uid()) and private.can_access_assignment(private.safe_uuid((storage.foldername(name))[3])) and private.is_enrolled_in_class(private.safe_uuid((storage.foldername(name))[2])))
  )
);
create policy "students upload own submission files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-submissions'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and private.safe_uuid((storage.foldername(name))[4]) = (select auth.uid())
  and private.can_access_assignment(private.safe_uuid((storage.foldername(name))[3]))
  and private.is_enrolled_in_class(private.safe_uuid((storage.foldername(name))[2]))
);
create policy "students delete own submission files" on storage.objects for delete to authenticated
using (
  bucket_id = 'student-submissions'
  and private.safe_uuid((storage.foldername(name))[1]) = (select private.current_college_id())
  and private.assignment_belongs_to_class(private.safe_uuid((storage.foldername(name))[2]), private.safe_uuid((storage.foldername(name))[3]))
  and private.safe_uuid((storage.foldername(name))[4]) = (select auth.uid())
  and private.can_access_assignment(private.safe_uuid((storage.foldername(name))[3]))
  and private.is_enrolled_in_class(private.safe_uuid((storage.foldername(name))[2]))
  and not exists (
    select 1 from public.submission_attachments sa
    where sa.storage_path = storage.objects.name and sa.college_id = private.current_college_id()
  )
);

create policy "users manage own profile image" on storage.objects for all to authenticated
using (bucket_id = 'profile-images' and private.safe_uuid((storage.foldername(name))[1]) = (select auth.uid()))
with check (bucket_id = 'profile-images' and private.safe_uuid((storage.foldername(name))[1]) = (select auth.uid()));
