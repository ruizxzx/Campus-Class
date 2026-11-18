-- CampusClass 2.0: attendance, student success follow-up and outcome tracking.
-- Apply manually in Supabase SQL Editor AFTER 202611180025.
-- Existing projects retain their data. These grants DO NOT enable anonymous writes.

begin;

create table if not exists public.attendance_sessions (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 class_id uuid not null,
 created_by uuid not null,
 title text not null check (char_length(title) between 2 and 120),
 starts_at timestamptz not null default now(),
 expires_at timestamptz not null,
 closed_at timestamptz,
 token_hash text not null unique check (char_length(token_hash) = 64),
 created_at timestamptz not null default now(),
 unique (college_id,id),
 check (expires_at > starts_at and expires_at <= starts_at + interval '30 minutes'),
 foreign key (college_id,class_id) references public.classes(college_id,id) on delete cascade,
 foreign key (college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists attendance_sessions_class_idx on public.attendance_sessions(college_id,class_id,starts_at desc);

create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 class_id uuid not null,
 session_id uuid not null,
 student_id uuid not null,
 status text not null default 'present' check (status in ('present','late','absent','excused')),
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (session_id, student_id),
 unique (college_id,id),
 foreign key (college_id,session_id) references public.attendance_sessions(college_id,id) on delete cascade,
 foreign key (college_id,class_id) references public.classes(college_id,id) on delete cascade,
 foreign key (college_id,student_id) references public.profiles(college_id,id) on delete cascade,
 foreign key (college_id,recorded_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists attendance_records_student_idx on public.attendance_records(college_id,student_id,class_id);
create index if not exists attendance_records_class_idx on public.attendance_records(college_id,class_id,session_id);

create table if not exists public.student_interventions (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 class_id uuid not null,
 student_id uuid not null,
 created_by uuid not null,
 reason text not null check (reason in ('attendance','missing_work','low_scores','support','other')),
 note text not null check (char_length(note) between 3 and 3000),
 status text not null default 'open' check (status in ('open','in_progress','resolved')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (college_id,id),
 foreign key (college_id,class_id) references public.classes(college_id,id) on delete cascade,
 foreign key (college_id,student_id) references public.profiles(college_id,id) on delete cascade,
 foreign key (college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists student_interventions_class_idx on public.student_interventions(college_id,class_id,created_at desc);
create index if not exists student_interventions_student_idx on public.student_interventions(college_id,student_id,created_at desc);

create table if not exists public.course_outcomes (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 subject_id uuid not null,
 created_by uuid not null,
 code text not null check (char_length(code) between 2 and 20),
 title text not null check (char_length(title) between 3 and 180),
 target_percent numeric(5,2) not null default 60 check (target_percent between 0 and 100),
 created_at timestamptz not null default now(),
 unique (college_id,id),
 unique (college_id,subject_id,code),
 foreign key (college_id,subject_id) references public.subjects(college_id,id) on delete cascade,
 foreign key (college_id,created_by) references public.profiles(college_id,id) on delete restrict
);

create table if not exists public.outcome_assessments (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 outcome_id uuid not null,
 assignment_id uuid,
 quiz_id uuid,
 weight numeric(5,2) not null default 1 check (weight > 0 and weight <= 100),
 created_at timestamptz not null default now(),
 check (num_nonnulls(assignment_id,quiz_id) = 1),
 unique (college_id,id),
 foreign key (college_id,outcome_id) references public.course_outcomes(college_id,id) on delete cascade,
 foreign key (college_id,assignment_id) references public.assignments(college_id,id) on delete cascade,
 foreign key (college_id,quiz_id) references public.quizzes(college_id,id) on delete cascade
);
create unique index if not exists outcome_assessment_assignment_idx on public.outcome_assessments(outcome_id,assignment_id) where assignment_id is not null;
create unique index if not exists outcome_assessment_quiz_idx on public.outcome_assessments(outcome_id,quiz_id) where quiz_id is not null;

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.student_interventions enable row level security;
alter table public.course_outcomes enable row level security;
alter table public.outcome_assessments enable row level security;

-- Write access is ONLY through server routes, which verify signed-in college users.
revoke all on public.attendance_sessions, public.attendance_records, public.student_interventions, public.course_outcomes, public.outcome_assessments from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.attendance_sessions, public.attendance_records, public.student_interventions, public.course_outcomes, public.outcome_assessments to service_role;
grant select on public.attendance_sessions, public.attendance_records, public.course_outcomes, public.outcome_assessments to authenticated;
grant select on public.student_interventions to authenticated;

drop policy if exists "college members see own attendance sessions" on public.attendance_sessions;
create policy "college members see own attendance sessions" on public.attendance_sessions
for select to authenticated using (
 college_id=(select private.current_college_id()) and
 (private.is_admin(college_id) or private.is_class_member(class_id))
);

drop policy if exists "attendance visible to student or staff" on public.attendance_records;
create policy "attendance visible to student or staff" on public.attendance_records
for select to authenticated using (
 college_id=(select private.current_college_id()) and
 (student_id=(select auth.uid()) or private.is_admin(college_id) or private.is_faculty_in_class(college_id,class_id))
);

drop policy if exists "interventions staff only" on public.student_interventions;
create policy "interventions staff only" on public.student_interventions
for select to authenticated using (
 college_id=(select private.current_college_id()) and
 (private.is_admin(college_id) or private.is_faculty_in_class(college_id,class_id))
);

drop policy if exists "college outcomes visible to members" on public.course_outcomes;
create policy "college outcomes visible to members" on public.course_outcomes
for select to authenticated using (
 college_id=(select private.current_college_id())
);

drop policy if exists "college outcome mappings visible to members" on public.outcome_assessments;
create policy "college outcome mappings visible to members" on public.outcome_assessments
for select to authenticated using (
 college_id=(select private.current_college_id())
);

commit;
