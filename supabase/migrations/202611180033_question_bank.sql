-- CampusClass 2.0: reusable, college-isolated faculty question bank.
-- Manual forward-only migration. Apply AFTER 202611180032.
begin;
create table if not exists public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  subject_id uuid not null,
  created_by uuid not null,
  question_type text not null check (question_type in ('multiple_choice','multiple_select','true_false','short_answer')),
  prompt text not null check (char_length(prompt) between 1 and 5000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options)='array'),
  answer_key jsonb,
  marks numeric(10,2) not null check (marks>0 and marks<=10000),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  tags text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(college_id,id),
  foreign key (college_id,subject_id) references public.subjects(college_id,id) on delete cascade,
  foreign key (college_id,created_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists question_bank_subject_idx on public.question_bank_items(college_id,subject_id,updated_at desc);
alter table public.question_bank_items enable row level security;
revoke all on public.question_bank_items from public,anon,authenticated;
grant select,insert,update,delete on public.question_bank_items to service_role;
commit;