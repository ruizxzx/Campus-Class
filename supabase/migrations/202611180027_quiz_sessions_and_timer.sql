-- CampusClass 2.0: durable quiz drafts and server-enforced attempt timers.
-- Apply manually AFTER migration 202611180026.
-- This intentionally revokes the legacy direct submission RPC to prevent bypassing timers.

begin;
create table if not exists public.quiz_attempt_sessions (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null,
 quiz_id uuid not null,
 student_id uuid not null,
 attempt_number integer not null check (attempt_number between 1 and 20),
 started_at timestamptz not null default now(),
 expires_at timestamptz not null,
 draft_answers jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 unique (quiz_id,student_id,attempt_number),
 check (expires_at > started_at),
 check (jsonb_typeof(draft_answers) = 'object'),
 check (octet_length(draft_answers::text) <= 65536),
 foreign key (college_id,quiz_id) references public.quizzes(college_id,id) on delete cascade,
 foreign key (college_id,student_id) references public.profiles(college_id,id) on delete cascade
);
create index if not exists quiz_attempt_sessions_student_idx on public.quiz_attempt_sessions(college_id,student_id,quiz_id);
alter table public.quiz_attempt_sessions enable row level security;
revoke all on public.quiz_attempt_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.quiz_attempt_sessions to service_role;

-- The original grader continues to perform the detailed question validation,
-- enrollment check, score calculation and max-attempt enforcement. This guard
-- verifies that a timed attempt was started BEFORE invoking that grader.
create or replace function private.submit_quiz_attempt_guarded(_quiz_id uuid, _answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_quiz public.quizzes%rowtype;
  v_number integer;
  v_session public.quiz_attempt_sessions%rowtype;
  v_result uuid;
begin
  if v_uid is null or private.current_role() is distinct from 'student' then
    raise exception using errcode='42501', message='Active student login required.';
  end if;
  -- Match the legacy submit function's advisory lock: two tabs cannot
  -- submit the same numbered attempt concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(_quiz_id::text || ':' || v_uid::text, 0)
  );
  select * into v_quiz from public.quizzes
  where id=_quiz_id and college_id=private.current_college_id()
  and status='published';
  if not found then
    raise exception using errcode='42501', message='Quiz not available.';
  end if;
  select count(*)+1 into v_number from public.quiz_attempts
  where college_id=v_quiz.college_id and quiz_id=_quiz_id and student_id=v_uid;
  select * into v_session from public.quiz_attempt_sessions
  where college_id=v_quiz.college_id and quiz_id=_quiz_id
    and student_id=v_uid and attempt_number=v_number
  for update;
  if not found then
    raise exception using errcode='42501', message='Start the quiz attempt before submitting.';
  end if;
  if now() < v_session.started_at or now() >= v_session.expires_at then
    raise exception using errcode='22023', message='Your attempt time has expired. Contact faculty if you need it reopened.';
  end if;
  v_result := public.submit_quiz_attempt(_quiz_id, _answers);
  delete from public.quiz_attempt_sessions where id=v_session.id;
  return v_result;
end
$$;

-- The public endpoint remains an INVOKER wrapper. Privileged grading logic
-- lives in the private schema and rechecks auth.uid()/role before using it.
create or replace function public.submit_quiz_attempt_v2(_quiz_id uuid, _answers jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.submit_quiz_attempt_guarded(_quiz_id, _answers); $$;

revoke all on function private.submit_quiz_attempt_guarded(uuid,jsonb) from public,anon;
grant execute on function private.submit_quiz_attempt_guarded(uuid,jsonb) to authenticated;
revoke all on function public.submit_quiz_attempt_v2(uuid,jsonb) from public,anon;
grant execute on function public.submit_quiz_attempt_v2(uuid,jsonb) to authenticated;

-- Critical: disallow submitting directly through the old grader without
-- the server-enforced attempt-start/expiry check.
revoke execute on function public.submit_quiz_attempt(uuid,jsonb) from public,anon,authenticated;

commit;
