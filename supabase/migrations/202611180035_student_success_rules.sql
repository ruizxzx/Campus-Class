-- Configurable, explainable support indicators (not a predictive ML model).
-- Apply manually after 202611180034_class_gradebook_policies.sql.
begin;
create table if not exists public.student_success_rules(
  college_id uuid primary key references public.colleges(id) on delete cascade,
  attendance_min_percent numeric(5,2) not null default 75
    check(attendance_min_percent between 0 and 100),
  overdue_assignment_count integer not null default 2
    check(overdue_assignment_count between 1 and 100),
  quiz_min_percent numeric(5,2) not null default 50
    check(quiz_min_percent between 0 and 100),
  min_attendance_sessions integer not null default 3
    check(min_attendance_sessions between 1 and 100),
  min_assigned_work integer not null default 2
    check(min_assigned_work between 1 and 100),
  min_released_quizzes integer not null default 2
    check(min_released_quizzes between 1 and 100),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  foreign key (college_id,updated_by) references public.profiles(college_id,id) on delete restrict
);
alter table public.student_success_rules enable row level security;
revoke all on public.student_success_rules from public,anon,authenticated;
grant select,insert,update,delete on public.student_success_rules to service_role;
commit;
