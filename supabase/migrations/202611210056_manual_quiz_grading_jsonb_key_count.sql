-- BUG-03: forward-only correction to migration 016's manual grading RPC.
-- Preserve all original authorization, validation, scoring and release behavior.
begin;
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
  v_submitted_score_count integer;
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
  select count(*) into v_submitted_score_count from pg_catalog.jsonb_object_keys(_question_scores);
  if v_submitted_score_count <> v_manual_question_count then
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
revoke all on function public.grade_quiz_attempt(uuid,jsonb,text,boolean) from public,anon;
grant execute on function public.grade_quiz_attempt(uuid,jsonb,text,boolean) to authenticated;
commit;
