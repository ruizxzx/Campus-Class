-- CONDITIONAL ONLY: section A confirms the named trigger or its function differs
-- from 029 AND the owner has reviewed the full diff and approved restoration.
-- No privilege escalation: keep SECURITY INVOKER and every original guard.
begin;
do $gate$
declare
  p oid := to_regprocedure('private.guard_quiz_attempt_session()');
  same_body boolean;
  same_trigger boolean;
begin
  if p is null then raise exception '057: missing guard function is not the confirmed 42501 path; inspect live schema'; end if;
  select regexp_replace(prosrc, '\s+', '', 'g') = regexp_replace($expected$
declare
  v_quiz public.quizzes%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_submitted_attempts integer;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or
      new.college_id is distinct from old.college_id or
      new.quiz_id is distinct from old.quiz_id or
      new.student_id is distinct from old.student_id or
      new.attempt_number is distinct from old.attempt_number or
      new.started_at is distinct from old.started_at or
      new.expires_at is distinct from old.expires_at then
      raise exception using errcode='23514', message='Quiz attempt timing and ownership are immutable.';
    end if;
    if v_now >= old.expires_at then
      raise exception using errcode='22023', message='The quiz attempt has expired.';
    end if;
    if exists (
      select 1 from public.quiz_attempts attempt
      where attempt.college_id=new.college_id and attempt.quiz_id=new.quiz_id
        and attempt.student_id=new.student_id
        and attempt.attempt_number=new.attempt_number
    ) then
      raise exception using errcode='23505', message='The quiz attempt has already been submitted.';
    end if;
    return new;
  end if;

  select * into v_quiz from public.quizzes
    where id=new.quiz_id and college_id=new.college_id for share;
  if not found or v_quiz.status <> 'published'
    or (v_quiz.opens_at is not null and v_now < v_quiz.opens_at)
    or (v_quiz.closes_at is not null and v_now >= v_quiz.closes_at) then
    raise exception using errcode='42501', message='The assessment is not open.';
  end if;
  if not exists (
    select 1 from public.class_enrollments enrollment
    where enrollment.college_id=new.college_id
      and enrollment.class_id=v_quiz.class_id
      and enrollment.student_id=new.student_id
      and enrollment.status='active'
  ) then
    raise exception using errcode='42501', message='Student is not enrolled in the assessment class.';
  end if;
  select count(*) into v_submitted_attempts from public.quiz_attempts
    where college_id=new.college_id and quiz_id=new.quiz_id and student_id=new.student_id;
  if new.attempt_number <> v_submitted_attempts + 1 or
     new.attempt_number > v_quiz.attempts_allowed then
    raise exception using errcode='23514', message='The quiz attempt number is invalid.';
  end if;

  new.started_at := v_now;
  new.expires_at := least(
    v_now + coalesce(v_quiz.duration_minutes, 10080) * interval '1 minute',
    coalesce(v_quiz.closes_at, 'infinity'::timestamptz)
  );
  return new;
end
$expected$, '\s+', '', 'g')
    and not prosecdef and proconfig = array['search_path=""']
    into same_body from pg_proc where oid=p;
  select exists(select 1 from pg_trigger where tgrelid='public.quiz_attempt_sessions'::regclass
    and tgname='campusclass_quiz_attempt_session_guard' and tgfoid=p
    and tgtype=23 and tgenabled in ('O','A') and not tgisinternal)
    into same_trigger;
  if coalesce(same_body,false) and same_trigger then
    raise exception '057: live guard already matches 029; do not apply';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.quiz_attempt_sessions'::regclass
    and tgname='campusclass_quiz_attempt_session_guard' and tgenabled in ('O','A') and not tgisinternal) then
    raise exception '057: live trigger is missing/disabled; investigate before repairing';
  end if;
end
$gate$;

create or replace function private.guard_quiz_attempt_session()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_submitted_attempts integer;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or
      new.college_id is distinct from old.college_id or
      new.quiz_id is distinct from old.quiz_id or
      new.student_id is distinct from old.student_id or
      new.attempt_number is distinct from old.attempt_number or
      new.started_at is distinct from old.started_at or
      new.expires_at is distinct from old.expires_at then
      raise exception using errcode='23514', message='Quiz attempt timing and ownership are immutable.';
    end if;
    if v_now >= old.expires_at then
      raise exception using errcode='22023', message='The quiz attempt has expired.';
    end if;
    if exists (
      select 1 from public.quiz_attempts attempt
      where attempt.college_id=new.college_id and attempt.quiz_id=new.quiz_id
        and attempt.student_id=new.student_id
        and attempt.attempt_number=new.attempt_number
    ) then
      raise exception using errcode='23505', message='The quiz attempt has already been submitted.';
    end if;
    return new;
  end if;

  select * into v_quiz from public.quizzes
    where id=new.quiz_id and college_id=new.college_id for share;
  if not found or v_quiz.status <> 'published'
    or (v_quiz.opens_at is not null and v_now < v_quiz.opens_at)
    or (v_quiz.closes_at is not null and v_now >= v_quiz.closes_at) then
    raise exception using errcode='42501', message='The assessment is not open.';
  end if;
  if not exists (
    select 1 from public.class_enrollments enrollment
    where enrollment.college_id=new.college_id
      and enrollment.class_id=v_quiz.class_id
      and enrollment.student_id=new.student_id
      and enrollment.status='active'
  ) then
    raise exception using errcode='42501', message='Student is not enrolled in the assessment class.';
  end if;
  select count(*) into v_submitted_attempts from public.quiz_attempts
    where college_id=new.college_id and quiz_id=new.quiz_id and student_id=new.student_id;
  if new.attempt_number <> v_submitted_attempts + 1 or
     new.attempt_number > v_quiz.attempts_allowed then
    raise exception using errcode='23514', message='The quiz attempt number is invalid.';
  end if;

  new.started_at := v_now;
  new.expires_at := least(
    v_now + coalesce(v_quiz.duration_minutes, 10080) * interval '1 minute',
    coalesce(v_quiz.closes_at, 'infinity'::timestamptz)
  );
  return new;
end
$$;
drop trigger if exists campusclass_quiz_attempt_session_guard on public.quiz_attempt_sessions;
create trigger campusclass_quiz_attempt_session_guard
before insert or update on public.quiz_attempt_sessions
for each row execute function private.guard_quiz_attempt_session();
commit;
