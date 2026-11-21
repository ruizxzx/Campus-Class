-- Forward-only BUG-03: migration 007 calls nonexistent jsonb_object_length(jsonb)
-- (SQLSTATE 42883). Count JSONB object keys using a PostgreSQL built-in instead.
-- Preserve the original grader, timer wrapper, enrollment checks, advisory lock,
-- scoring and release behavior; the legacy RPC must remain inaccessible to clients.
begin;

create or replace function public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quiz public.quizzes%rowtype;
  v_attempt_count integer;
  v_answer_count integer;
  v_attempt_id uuid;
  v_total_score numeric(8,2) := 0;
  v_question record;
  v_question_count integer := 0;
  v_keyed_question_count integer := 0;
  v_can_auto_grade boolean := false;
begin
  if v_user_id is null or private.current_role() is distinct from 'student' then
    raise exception using errcode = '42501', message = 'Only active students may submit quiz attempts.';
  end if;
  if _quiz_id is null then
    raise exception using errcode = '22023', message = 'A quiz ID is required.';
  end if;
  if _answers is null or jsonb_typeof(_answers) <> 'object' then
    raise exception using errcode = '22023', message = 'Quiz answers must be a JSON object.';
  end if;
  select count(*) into v_answer_count from pg_catalog.jsonb_object_keys(_answers);
  if v_answer_count = 0 then
    raise exception using errcode = '22023', message = 'Quiz answers must be a non-empty JSON object.';
  end if;
  if octet_length(_answers::text) > 65536 or v_answer_count > 500 then
    raise exception using errcode = '22023', message = 'The quiz answer payload is too large.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(_quiz_id::text || ':' || v_user_id::text, 0)
  );

  select q.* into v_quiz
  from public.quizzes q
  where q.id = _quiz_id
    and q.college_id = private.current_college_id()
    and q.status = 'published'
    and (q.opens_at is null or q.opens_at <= now())
    and (q.closes_at is null or q.closes_at > now());
  if not found or not private.is_enrolled_in_class(v_quiz.class_id) then
    raise exception using errcode = '42501', message = 'This quiz is unavailable to the current student.';
  end if;

  if exists (
    select 1
    from jsonb_each(_answers) submitted(question_key, answer)
    left join public.quiz_questions question
      on question.id::text = submitted.question_key
     and question.quiz_id = v_quiz.id
     and question.college_id = v_quiz.college_id
    where question.id is null
       or (
         question.question_type = 'short_answer'
         and (
           jsonb_typeof(submitted.answer) <> 'string'
           or char_length(submitted.answer #>> '{}') > 5000
         )
       )
       or (
         question.question_type = 'true_false'
         and (
           jsonb_typeof(submitted.answer) <> 'string'
           or submitted.answer #>> '{}' not in ('True', 'False')
         )
       )
       or (
         question.question_type = 'multiple_choice'
         and (
           jsonb_typeof(submitted.answer) <> 'string'
           or not exists (
             select 1
             from jsonb_array_elements(
               case
                 when jsonb_typeof(question.options) = 'array' then question.options
                 else '[]'::jsonb
               end
             ) with ordinality option_item(value, ordinal)
             where case
               when jsonb_typeof(option_item.value) = 'string'
                 then option_item.value #>> '{}' = submitted.answer #>> '{}'
               else coalesce(option_item.value ->> 'value', (option_item.ordinal - 1)::text)
                 = submitted.answer #>> '{}'
             end
           )
         )
       )
       or (
         question.question_type = 'multiple_select'
         and (
           jsonb_typeof(submitted.answer) <> 'array'
           or jsonb_array_length(
             case
               when jsonb_typeof(submitted.answer) = 'array' then submitted.answer
               else '[]'::jsonb
             end
           ) = 0
           or jsonb_array_length(
             case
               when jsonb_typeof(submitted.answer) = 'array' then submitted.answer
               else '[]'::jsonb
             end
           ) > 50
           or exists (
             select 1
             from jsonb_array_elements(
               case
                 when jsonb_typeof(submitted.answer) = 'array' then submitted.answer
                 else '[]'::jsonb
               end
             ) selected(value)
             where jsonb_typeof(selected.value) <> 'string'
                or char_length(selected.value #>> '{}') > 5000
                or not exists (
                  select 1
                  from jsonb_array_elements(
                    case
                      when jsonb_typeof(question.options) = 'array' then question.options
                      else '[]'::jsonb
                    end
                  ) with ordinality option_item(value, ordinal)
                  where case
                    when jsonb_typeof(option_item.value) = 'string'
                      then option_item.value #>> '{}' = selected.value #>> '{}'
                    else coalesce(option_item.value ->> 'value', (option_item.ordinal - 1)::text)
                      = selected.value #>> '{}'
                  end
                )
           )
           or jsonb_array_length(
             case
               when jsonb_typeof(submitted.answer) = 'array' then submitted.answer
               else '[]'::jsonb
             end
           ) <> (
             select count(distinct selected.value)
             from jsonb_array_elements(
               case
                 when jsonb_typeof(submitted.answer) = 'array' then submitted.answer
                 else '[]'::jsonb
               end
             ) selected(value)
           )
         )
       )
  ) then
    raise exception using errcode = '22023', message = 'Quiz answers contain an invalid question or answer.';
  end if;

  select count(*) into v_attempt_count
  from public.quiz_attempts qa
  where qa.college_id = v_quiz.college_id
    and qa.quiz_id = v_quiz.id
    and qa.student_id = v_user_id;
  if v_attempt_count >= v_quiz.attempts_allowed then
    raise exception using errcode = '42501', message = 'No quiz attempts remain.';
  end if;

  for v_question in
    select question.id, question.question_type, question.answer_key, question.marks
    from public.quiz_questions question
    where question.college_id = v_quiz.college_id
      and question.quiz_id = v_quiz.id
  loop
    v_question_count := v_question_count + 1;
    if v_question.answer_key is not null then
      v_keyed_question_count := v_keyed_question_count + 1;
      if _answers ? v_question.id::text then
        if v_question.question_type = 'multiple_select'
          and jsonb_typeof(v_question.answer_key) = 'array'
          and jsonb_typeof(_answers -> v_question.id::text) = 'array'
        then
          if (
            select jsonb_agg(selected.value order by selected.value)
            from jsonb_array_elements_text(_answers -> v_question.id::text) selected(value)
          ) is not distinct from (
            select jsonb_agg(correct.value order by correct.value)
            from jsonb_array_elements_text(v_question.answer_key) correct(value)
          ) then
            v_total_score := v_total_score + v_question.marks;
          end if;
        elsif (_answers ->> v_question.id::text) = (v_question.answer_key #>> '{}')
           or (_answers -> v_question.id::text) = v_question.answer_key
        then
          v_total_score := v_total_score + v_question.marks;
        end if;
      end if;
    end if;
  end loop;

  v_can_auto_grade := v_question_count > 0 and v_question_count = v_keyed_question_count;
  if v_can_auto_grade and v_total_score > v_quiz.max_marks then
    raise exception using errcode = '23514', message = 'Configured question marks exceed the quiz maximum.';
  end if;

  insert into public.quiz_attempts (
    college_id, quiz_id, student_id, attempt_number, answers, score, status, submitted_at, released_at
  ) values (
    v_quiz.college_id,
    v_quiz.id,
    v_user_id,
    v_attempt_count + 1,
    _answers,
    case when v_can_auto_grade then v_total_score else null end,
    case when v_can_auto_grade and v_quiz.show_score_after_submit then 'graded' else 'submitted' end,
    now(),
    case when v_can_auto_grade and v_quiz.show_score_after_submit then now() else null end
  )
  returning id into v_attempt_id;

  insert into public.student_learning_stats as stats (
    college_id, student_id, xp, level, current_streak, longest_streak, last_activity_date
  ) values (
    v_quiz.college_id, v_user_id, 25, 1, 1, 1, current_date
  )
  on conflict (student_id) do update set
    xp = stats.xp + 25,
    level = (stats.xp + 25) / 100 + 1,
    current_streak = case
      when stats.last_activity_date = current_date
        then greatest(stats.current_streak, 1)
      when stats.last_activity_date = current_date - 1
        then stats.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      stats.longest_streak,
      case
        when stats.last_activity_date = current_date
          then greatest(stats.current_streak, 1)
        when stats.last_activity_date = current_date - 1
          then stats.current_streak + 1
        else 1
      end
    ),
    last_activity_date = current_date,
    updated_at = now();

  return v_attempt_id;
end
$$;

revoke all on function public.submit_quiz_attempt(uuid,jsonb) from public,anon,authenticated;
commit;
