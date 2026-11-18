-- Class Gradebook policies are OPTIONAL until explicitly configured by staff.
-- Forward-only; apply manually after 202611180033_question_bank.sql.
begin;
create table if not exists public.class_gradebook_policies (
  college_id uuid not null,
  class_id uuid not null,
  assignment_weight numeric(5,2) not null,
  project_weight numeric(5,2) not null,
  quiz_weight numeric(5,2) not null,
  attendance_weight numeric(5,2) not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(college_id,class_id),
  foreign key (college_id,class_id) references public.classes(college_id,id) on delete cascade,
  foreign key (college_id,updated_by) references public.profiles(college_id,id) on delete restrict,
  constraint class_gradebook_policy_weights_check check(
    assignment_weight between 0 and 100
    and project_weight between 0 and 100
    and quiz_weight between 0 and 100
    and attendance_weight between 0 and 100
    and assignment_weight+project_weight+quiz_weight+attendance_weight=100.00
  )
);
alter table public.class_gradebook_policies enable row level security;
revoke all on public.class_gradebook_policies from public,anon,authenticated;
grant select,insert,update,delete on public.class_gradebook_policies to service_role;
commit;

-- Verify (non-sensitive):
-- select table_name from information_schema.tables
-- where table_schema='public' and table_name='class_gradebook_policies';
