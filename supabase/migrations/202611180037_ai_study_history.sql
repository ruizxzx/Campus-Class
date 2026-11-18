-- Campus Class 2.0: private persistent student Copilot history.
-- Forward-only migration 037: apply manually after 036 on Campus Class project.
begin;
create table if not exists public.ai_study_exchanges (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  student_id uuid not null,
  request_id uuid not null,
  mode text not null check (mode in ('chat','practice','revision')),
  syllabus_id uuid,
  question text not null check (char_length(question) between 1 and 4000),
  answer text not null check (char_length(answer) between 1 and 24000),
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources)='array' and pg_column_size(sources)<=16000),
  created_at timestamptz not null default now(),
  unique(college_id,student_id,request_id),
  unique(college_id,id),
  foreign key (college_id,student_id) references public.profiles(college_id,id)
    on delete cascade,
  foreign key (college_id,syllabus_id) references public.class_syllabi(college_id,id)
    on delete set null (syllabus_id)
);
create index if not exists ai_study_exchanges_user_time_idx
  on public.ai_study_exchanges(college_id,student_id,created_at desc,id desc);
alter table public.ai_study_exchanges enable row level security;
revoke all on public.ai_study_exchanges from public,anon,authenticated;
grant select,insert,delete on public.ai_study_exchanges to service_role;
commit;

-- Post-patch non-sensitive verification:
-- select relrowsecurity from pg_class where oid='public.ai_study_exchanges'::regclass;
-- select has_table_privilege('authenticated','public.ai_study_exchanges','SELECT');
