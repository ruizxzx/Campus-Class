-- Limit student course discovery to subjects represented by an active enrollment.
drop policy if exists "active course catalog and managed courses visible" on public.courses;
create policy "active courses visible to subject members and managers" on public.courses
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or private.can_manage_course(college_id, subject_id)
    or (
      status = 'active'
      and private.current_role() = 'student'
      and exists (
        select 1
        from public.classes class
        where class.college_id = courses.college_id
          and class.subject_id = courses.subject_id
          and private.is_enrolled_in_class(class.id)
      )
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-stream',
  'class-stream',
  false,
  31457280,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read authorized class stream attachments" on storage.objects;
create policy "read authorized class stream attachments" on storage.objects
for select to authenticated
using (
  bucket_id = 'class-stream'
  and exists (
    select 1
    from public.stream_attachments attachment
    join public.class_stream_posts post
      on post.college_id = attachment.college_id
     and post.id = attachment.post_id
    where attachment.storage_path = name
      and post.college_id = private.safe_uuid((storage.foldername(name))[1])
      and post.class_id = private.safe_uuid((storage.foldername(name))[2])
      and post.id = private.safe_uuid((storage.foldername(name))[3])
      and private.can_view_stream_post(post.id)
  )
);

drop policy if exists "class managers upload stream attachments" on storage.objects;
create policy "class managers upload stream attachments" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'class-stream'
  and exists (
    select 1
    from public.class_stream_posts post
    where post.college_id = private.safe_uuid((storage.foldername(name))[1])
      and post.class_id = private.safe_uuid((storage.foldername(name))[2])
      and post.id = private.safe_uuid((storage.foldername(name))[3])
      and (
        private.is_admin(post.college_id)
        or private.is_faculty_in_class(post.college_id, post.class_id)
      )
  )
);

drop policy if exists "class managers update stream attachments" on storage.objects;
create policy "class managers update stream attachments" on storage.objects
for update to authenticated
using (
  bucket_id = 'class-stream'
  and exists (
    select 1
    from public.class_stream_posts post
    where post.college_id = private.safe_uuid((storage.foldername(name))[1])
      and post.class_id = private.safe_uuid((storage.foldername(name))[2])
      and post.id = private.safe_uuid((storage.foldername(name))[3])
      and (
        private.is_admin(post.college_id)
        or private.is_faculty_in_class(post.college_id, post.class_id)
      )
  )
)
with check (
  bucket_id = 'class-stream'
  and exists (
    select 1
    from public.class_stream_posts post
    where post.college_id = private.safe_uuid((storage.foldername(name))[1])
      and post.class_id = private.safe_uuid((storage.foldername(name))[2])
      and post.id = private.safe_uuid((storage.foldername(name))[3])
      and (
        private.is_admin(post.college_id)
        or private.is_faculty_in_class(post.college_id, post.class_id)
      )
  )
);

drop policy if exists "class managers delete stream attachments" on storage.objects;
create policy "class managers delete stream attachments" on storage.objects
for delete to authenticated
using (
  bucket_id = 'class-stream'
  and exists (
    select 1
    from public.class_stream_posts post
    where post.college_id = private.safe_uuid((storage.foldername(name))[1])
      and post.class_id = private.safe_uuid((storage.foldername(name))[2])
      and post.id = private.safe_uuid((storage.foldername(name))[3])
      and (
        private.is_admin(post.college_id)
        or private.is_faculty_in_class(post.college_id, post.class_id)
      )
  )
);

create or replace function public.get_my_quiz_attempts(_quiz_id uuid)
returns table (
  id uuid,
  attempt_number integer,
  status text,
  score numeric,
  submitted_at timestamptz,
  released_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attempt.id,
    attempt.attempt_number,
    attempt.status,
    case when attempt.released_at is not null then attempt.score else null end,
    attempt.submitted_at,
    attempt.released_at
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
   and quiz.college_id = attempt.college_id
  where attempt.quiz_id = _quiz_id
    and attempt.college_id = private.current_college_id()
    and attempt.student_id = (select auth.uid())
    and private.current_role() = 'student'
    and private.is_enrolled_in_class(quiz.class_id)
  order by attempt.attempt_number desc
$$;

revoke all on function public.get_my_quiz_attempts(uuid) from public, anon;
grant execute on function public.get_my_quiz_attempts(uuid) to authenticated;

alter table public.quiz_attempts
  add column if not exists evaluation_feedback text,
  add column if not exists graded_by uuid,
  add column if not exists question_scores jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.quiz_attempts'::regclass
      and conname = 'quiz_attempts_college_graded_by_fkey'
  ) then
    alter table public.quiz_attempts
      add constraint quiz_attempts_college_graded_by_fkey
      foreign key (college_id, graded_by)
      references public.profiles(college_id, id)
      on delete restrict;
  end if;
end
$$;

create or replace function public.grade_quiz_attempt(
  _attempt_id uuid,
  _question_scores jsonb,
  _feedback text,
  _release boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_attempt public.quiz_attempts%rowtype;
  v_quiz public.quizzes%rowtype;
  v_question record;
  v_total_score numeric(8,2) := 0;
  v_manual_question_count integer;
begin
  if v_user_id is null
    or (
      private.current_role() is distinct from 'faculty'
      and private.current_role() is distinct from 'admin'
    )
  then
    raise exception using errcode = '42501', message = 'Only active faculty or administrators may grade attempts.';
  end if;
  if _attempt_id is null
    or _question_scores is null
    or jsonb_typeof(_question_scores) <> 'object'
    or octet_length(_question_scores::text) > 65536
    or coalesce(char_length(_feedback), 0) > 10000
  then
    raise exception using errcode = '22023', message = 'The evaluation is invalid.';
  end if;

  select attempt.* into v_attempt
  from public.quiz_attempts attempt
  where attempt.id = _attempt_id
    and attempt.college_id = private.current_college_id();
  if not found then
    raise exception using errcode = 'P0002', message = 'The attempt is unavailable.';
  end if;

  select quiz.* into v_quiz
  from public.quizzes quiz
  where quiz.id = v_attempt.quiz_id
    and quiz.college_id = v_attempt.college_id;
  if not found
    or not (
      private.is_admin(v_quiz.college_id)
      or private.is_faculty_in_class(v_quiz.college_id, v_quiz.class_id)
    )
  then
    raise exception using errcode = '42501', message = 'You cannot grade this class assessment.';
  end if;
  if v_attempt.status not in ('submitted', 'graded') or v_attempt.released_at is not null then
    raise exception using errcode = '55000', message = 'This attempt is not available for evaluation.';
  end if;

  if exists (
    select 1
    from jsonb_each(_question_scores) submitted(question_id, score)
    left join public.quiz_questions question
      on question.id::text = submitted.question_id
     and question.quiz_id = v_quiz.id
     and question.college_id = v_quiz.college_id
    where question.id is null
       or question.question_type <> 'short_answer'
       or case
         when jsonb_typeof(submitted.score) = 'number'
           then (submitted.score #>> '{}')::numeric < 0
             or (submitted.score #>> '{}')::numeric > question.marks
         else true
       end
  ) then
    raise exception using errcode = '22023', message = 'Question scores are invalid.';
  end if;

  select count(*) into v_manual_question_count
  from public.quiz_questions question
  where question.college_id = v_quiz.college_id
    and question.quiz_id = v_quiz.id
    and question.question_type = 'short_answer';
  if jsonb_object_length(_question_scores) <> v_manual_question_count then
    raise exception using errcode = '22023', message = 'Grade every short-answer question before saving.';
  end if;

  for v_question in
    select question.id, question.question_type, question.answer_key, question.marks
    from public.quiz_questions question
    where question.college_id = v_quiz.college_id
      and question.quiz_id = v_quiz.id
  loop
    if v_question.question_type = 'short_answer' then
      v_total_score := v_total_score + ((_question_scores ->> v_question.id::text)::numeric);
    elsif v_question.answer_key is not null
      and v_attempt.answers ? v_question.id::text
    then
      if v_question.question_type = 'multiple_select'
        and jsonb_typeof(v_question.answer_key) = 'array'
        and jsonb_typeof(v_attempt.answers -> v_question.id::text) = 'array'
      then
        if (
          select jsonb_agg(selected.value order by selected.value)
          from jsonb_array_elements_text(v_attempt.answers -> v_question.id::text) selected(value)
        ) is not distinct from (
          select jsonb_agg(correct.value order by correct.value)
          from jsonb_array_elements_text(v_question.answer_key) correct(value)
        ) then
          v_total_score := v_total_score + v_question.marks;
        end if;
      elsif (v_attempt.answers ->> v_question.id::text) = (v_question.answer_key #>> '{}')
         or (v_attempt.answers -> v_question.id::text) = v_question.answer_key
      then
        v_total_score := v_total_score + v_question.marks;
      end if;
    end if;
  end loop;

  if v_total_score > v_quiz.max_marks then
    raise exception using errcode = '23514', message = 'The configured question marks exceed the assessment maximum.';
  end if;

  update public.quiz_attempts
  set score = v_total_score,
      status = 'graded',
      question_scores = _question_scores,
      evaluation_feedback = nullif(btrim(coalesce(_feedback, '')), ''),
      graded_by = v_user_id,
      released_at = case when _release then now() else null end
  where id = v_attempt.id
    and college_id = v_attempt.college_id;
end
$$;

revoke all on function public.grade_quiz_attempt(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.grade_quiz_attempt(uuid, jsonb, text, boolean) to authenticated;

create or replace function private.notify_quiz_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.status is distinct from new.status)
  ) then
    insert into public.notifications (college_id, user_id, type, title, body, href, reference_key)
    select new.college_id, enrollment.student_id, 'quiz_published',
      'New assessment: ' || new.title, left(coalesce(new.description, ''), 240),
      '/quizzes/' || new.id::text,
      'quiz-published:' || new.id::text || ':' || enrollment.student_id::text
    from public.class_enrollments enrollment
    join public.profiles student
      on student.id = enrollment.student_id
     and student.college_id = enrollment.college_id
     and student.status = 'active'
     and student.role = 'student'
    where enrollment.college_id = new.college_id
      and enrollment.class_id = new.class_id
      and enrollment.status = 'active'
    on conflict (user_id, reference_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists quiz_publication_notification on public.quizzes;
create trigger quiz_publication_notification
after insert or update of status on public.quizzes
for each row execute function private.notify_quiz_publication();

create or replace function private.notify_quiz_result_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.released_at is not null and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.released_at is null)
  ) then
    insert into public.notifications (college_id, user_id, type, title, body, href, reference_key)
    select new.college_id, new.student_id, 'quiz_result',
      'Assessment result released', quiz.title,
      '/quizzes/' || quiz.id::text,
      'quiz-result:' || new.id::text
    from public.quizzes quiz
    join public.profiles student
      on student.id = new.student_id
     and student.college_id = new.college_id
     and student.role = 'student'
     and student.status = 'active'
    where quiz.id = new.quiz_id
      and quiz.college_id = new.college_id
    on conflict (user_id, reference_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists quiz_result_release_notification on public.quiz_attempts;
create trigger quiz_result_release_notification
after insert or update of released_at on public.quiz_attempts
for each row execute function private.notify_quiz_result_release();

revoke all on function private.notify_quiz_publication() from public, anon, authenticated;
revoke all on function private.notify_quiz_result_release() from public, anon, authenticated;
