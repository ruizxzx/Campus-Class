-- CampusClass 2.0 forward-only integrity patch.
-- Apply manually AFTER 202611180028. Does not rewrite historical attendance or quiz attempts.
-- Verifies time and enrollment at the DATABASE, not only in a Next.js request.

begin;

-- Make a session's start/end times reflect database clock time, preserving the
-- requested duration rather than trusting a potentially skewed application host.
create or replace function private.set_attendance_session_clock()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_duration interval;
begin
  v_duration := new.expires_at - new.starts_at;
  if v_duration <= interval '0 seconds' or v_duration > interval '30 minutes' then
    raise exception using errcode='22023', message='Invalid attendance session duration.';
  end if;
  new.starts_at := v_now;
  new.expires_at := v_now + v_duration;
  return new;
end
$$;

drop trigger if exists campusclass_attendance_session_clock on public.attendance_sessions;
create trigger campusclass_attendance_session_clock
before insert on public.attendance_sessions
for each row execute function private.set_attendance_session_clock();

-- Lock the session row while checking expiry/closure: concurrent closure must
-- not slip between the check and recording of attendance.
create or replace function private.guard_attendance_record()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if tg_op = 'UPDATE' and (
    new.college_id is distinct from old.college_id or
    new.class_id is distinct from old.class_id or
    new.session_id is distinct from old.session_id or
    new.student_id is distinct from old.student_id or
    new.id is distinct from old.id
  ) then
    raise exception using errcode='23514', message='An attendance record cannot change its session or student.';
  end if;

  select * into v_session from public.attendance_sessions
  where id = new.session_id and college_id = new.college_id
  for share;
  if not found or v_session.class_id is distinct from new.class_id then
    raise exception using errcode='23503', message='Attendance must belong to the session class.';
  end if;

  if not exists (
    select 1 from public.class_enrollments enrollment
    where enrollment.college_id = new.college_id
      and enrollment.class_id = new.class_id
      and enrollment.student_id = new.student_id
      and enrollment.status = 'active'
  ) then
    raise exception using errcode='42501', message='Student is not actively enrolled in this session class.';
  end if;

  -- Self check-ins are never equivalent to authorized faculty corrections.
  if tg_op = 'INSERT' and new.recorded_by = new.student_id then
    if new.status <> 'present' then
      raise exception using errcode='42501', message='Students may only check in as present.';
    end if;
    if v_session.closed_at is not null or
      v_now < v_session.starts_at or v_now >= v_session.expires_at then
      raise exception using errcode='23P01', message='Attendance session is closed or expired.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists campusclass_attendance_record_guard on public.attendance_records;
create trigger campusclass_attendance_record_guard
before insert or update on public.attendance_records
for each row execute function private.guard_attendance_record();

-- Immutable event history for manual corrections. The log is not readable by
-- students, and previous rows are never deleted or reset by this migration.
create table if not exists public.attendance_correction_audit (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  record_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  changed_by uuid not null,
  previous_status text,
  new_status text not null,
  changed_at timestamptz not null default now(),
  foreign key (college_id, record_id) references public.attendance_records(college_id,id) on delete cascade,
  foreign key (college_id, class_id) references public.classes(college_id,id) on delete cascade,
  foreign key (college_id,changed_by) references public.profiles(college_id,id) on delete restrict
);
create index if not exists attendance_correction_audit_class_idx
  on public.attendance_correction_audit(college_id,class_id,changed_at desc);
create index if not exists attendance_correction_audit_student_idx
  on public.attendance_correction_audit(college_id,student_id,changed_at desc);
alter table public.attendance_correction_audit enable row level security;
revoke all on public.attendance_correction_audit from public, anon, authenticated;
grant select,insert on public.attendance_correction_audit to service_role;
grant select on public.attendance_correction_audit to authenticated;
drop policy if exists "staff can review attendance corrections" on public.attendance_correction_audit;
create policy "staff can review attendance corrections"
  on public.attendance_correction_audit for select to authenticated
  using (
    college_id = (select private.current_college_id())
    and (private.is_admin(college_id) or private.is_faculty_in_class(college_id,class_id))
  );

create or replace function private.log_attendance_correction()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.recorded_by = new.student_id then return null; end if;
    insert into public.attendance_correction_audit (
      college_id,record_id,class_id,session_id,student_id,changed_by,previous_status,new_status
    ) values (
      new.college_id,new.id,new.class_id,new.session_id,new.student_id,new.recorded_by,null,new.status
    );
  elsif old.status is distinct from new.status then
    insert into public.attendance_correction_audit (
      college_id,record_id,class_id,session_id,student_id,changed_by,previous_status,new_status
    ) values (
      new.college_id,new.id,new.class_id,new.session_id,new.student_id,new.recorded_by,old.status,new.status
    );
  end if;
  return null;
end
$$;
drop trigger if exists campusclass_attendance_correction_audit on public.attendance_records;
create trigger campusclass_attendance_correction_audit
after insert or update of status,recorded_by on public.attendance_records
for each row execute function private.log_attendance_correction();

-- A quiz attempt starts on the DB clock; a client cannot extend it by sending
-- a fabricated started_at or expires_at. Draft saves stop at actual expiry.
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

-- Close a long-lived transaction time loophole in the pre-existing guarded RPC:
-- clock_timestamp() reflects the true current database time at submission.

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
  if clock_timestamp() < v_session.started_at or clock_timestamp() >= v_session.expires_at then
    raise exception using errcode='22023', message='Your attempt time has expired. Contact faculty if you need it reopened.';
  end if;
  v_result := public.submit_quiz_attempt(_quiz_id, _answers);
  delete from public.quiz_attempt_sessions where id=v_session.id;
  return v_result;
end
$$;


commit;
