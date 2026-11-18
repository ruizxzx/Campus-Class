-- Create a complete assessment in one authenticated database transaction.
create or replace function public.create_quiz_with_questions(
  _class_id uuid,
  _title text,
  _description text,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _duration_minutes integer,
  _attempts_allowed integer,
  _show_score_after_submit boolean,
  _publish boolean,
  _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_college_id uuid;
  v_role text;
  v_class_active boolean;
  v_quiz_id uuid;
  v_question jsonb;
  v_question_type text;
  v_marks numeric;
  v_total_marks numeric := 0;
  v_position integer := 0;
  v_answer_count integer;
  v_distinct_answer_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select profile.college_id, profile.role
    into v_college_id, v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.status = 'active';

  if v_college_id is null or v_role not in ('admin', 'faculty') then
    raise exception using errcode = '42501', message = 'Only active faculty or administrators may create assessments.';
  end if;

  select classroom.is_active
    into v_class_active
  from public.classes classroom
  where classroom.id = _class_id
    and classroom.college_id = v_college_id;

  if not found or v_class_active is not true then
    raise exception using errcode = '42501', message = 'This classroom is unavailable.';
  end if;

  if v_role = 'faculty'
     and not private.is_faculty_in_class(v_college_id, _class_id) then
    raise exception using errcode = '42501', message = 'You are not assigned to this classroom.';
  end if;

  if _title is null or char_length(btrim(_title)) not between 2 and 180
     or char_length(coalesce(_description, '')) > 10000
     or (_opens_at is not null and _closes_at is not null and _closes_at <= _opens_at)
     or (_duration_minutes is not null and _duration_minutes not between 1 and 600)
     or _attempts_allowed is null
     or _attempts_allowed not between 1 and 20
     or _show_score_after_submit is null
     or _publish is null then
    raise exception using errcode = '22023', message = 'Assessment settings are invalid.';
  end if;

  if jsonb_typeof(_questions) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Assessment questions must be an array.';
  end if;
  if jsonb_array_length(_questions) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Add between 1 and 100 questions.';
  end if;

  for v_question in
    select item.value
    from jsonb_array_elements(_questions) as item(value)
  loop
    if jsonb_typeof(v_question) is distinct from 'object'
       or jsonb_typeof(v_question -> 'question_type') is distinct from 'string'
       or jsonb_typeof(v_question -> 'prompt') is distinct from 'string'
       or jsonb_typeof(v_question -> 'options') is distinct from 'array'
       or jsonb_typeof(v_question -> 'marks') is distinct from 'number'
       or jsonb_typeof(v_question -> 'answer_key') is distinct from 'string'
          and jsonb_typeof(v_question -> 'answer_key') is distinct from 'array'
          and jsonb_typeof(v_question -> 'answer_key') is distinct from 'null' then
      raise exception using errcode = '22023', message = 'A question has invalid fields.';
    end if;

    v_question_type := v_question ->> 'question_type';
    if v_question_type not in ('multiple_choice', 'multiple_select', 'true_false', 'short_answer')
       or char_length(btrim(v_question ->> 'prompt')) not between 1 and 5000 then
      raise exception using errcode = '22023', message = 'A question type or prompt is invalid.';
    end if;

    if jsonb_array_length(v_question -> 'options') > 100
       or exists (
         select 1
         from jsonb_array_elements(v_question -> 'options') as option_item(value)
         where jsonb_typeof(option_item.value) is distinct from 'string'
            or char_length(btrim(option_item.value #>> '{}')) not between 1 and 500
       )
       or exists (
         select 1
         from jsonb_array_elements_text(v_question -> 'options') as option_item(value)
         group by option_item.value
         having count(*) > 1
       ) then
      raise exception using errcode = '22023', message = 'Question choices must be unique, non-empty text.';
    end if;

    if v_question_type = 'short_answer' then
      if jsonb_array_length(v_question -> 'options') <> 0
         or jsonb_typeof(v_question -> 'answer_key') is distinct from 'null' then
        raise exception using errcode = '22023', message = 'Short-answer questions are manually graded and cannot have answer choices.';
      end if;
    elsif v_question_type = 'true_false' then
      if v_question -> 'options' <> '["True", "False"]'::jsonb
         or jsonb_typeof(v_question -> 'answer_key') is distinct from 'string'
         or v_question ->> 'answer_key' not in ('True', 'False') then
        raise exception using errcode = '22023', message = 'True/false questions need a valid correct answer.';
      end if;
    elsif v_question_type = 'multiple_choice' then
      if jsonb_array_length(v_question -> 'options') < 2
         or jsonb_typeof(v_question -> 'answer_key') is distinct from 'string'
         or not exists (
           select 1
           from jsonb_array_elements_text(v_question -> 'options') as option_item(value)
           where option_item.value = v_question ->> 'answer_key'
         ) then
        raise exception using errcode = '22023', message = 'Multiple-choice questions need at least two choices and one valid correct answer.';
      end if;
    else
      if jsonb_array_length(v_question -> 'options') < 2
         or jsonb_typeof(v_question -> 'answer_key') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'Multiple-select questions need at least two choices and a list of correct choices.';
      end if;
      if jsonb_array_length(v_question -> 'answer_key') < 1
         or exists (
           select 1
           from jsonb_array_elements(v_question -> 'answer_key') as answer_item(value)
           where jsonb_typeof(answer_item.value) is distinct from 'string'
              or not exists (
                select 1
                from jsonb_array_elements_text(v_question -> 'options') as option_item(value)
                where option_item.value = answer_item.value #>> '{}'
              )
         ) then
        raise exception using errcode = '22023', message = 'Multiple-select questions need valid correct choices.';
      end if;

      select count(*), count(distinct answer_item.value)
        into v_answer_count, v_distinct_answer_count
      from jsonb_array_elements_text(v_question -> 'answer_key') as answer_item(value);
      if v_answer_count <> v_distinct_answer_count then
        raise exception using errcode = '22023', message = 'Correct choices cannot be duplicated.';
      end if;
    end if;

    v_marks := round((v_question ->> 'marks')::numeric, 2);
    if v_marks <= 0 or v_marks > 10000 then
      raise exception using errcode = '22023', message = 'Question marks must be between 0 and 10000.';
    end if;
    v_total_marks := v_total_marks + v_marks;
    v_position := v_position + 1;
  end loop;

  if v_total_marks > 999999.99 then
    raise exception using errcode = '22023', message = 'The total marks exceed the supported assessment maximum.';
  end if;

  insert into public.quizzes (
    college_id, class_id, created_by, title, description, opens_at, closes_at,
    duration_minutes, max_marks, attempts_allowed, show_score_after_submit, status
  ) values (
    v_college_id, _class_id, v_user_id, btrim(_title), nullif(btrim(coalesce(_description, '')), ''),
    _opens_at, _closes_at, _duration_minutes, v_total_marks, _attempts_allowed,
    _show_score_after_submit, case when _publish then 'published' else 'draft' end
  )
  returning id into v_quiz_id;

  v_position := 0;
  for v_question in
    select item.value
    from jsonb_array_elements(_questions) as item(value)
  loop
    insert into public.quiz_questions (
      college_id, quiz_id, position, question_type, prompt, options, answer_key, marks
    ) values (
      v_college_id, v_quiz_id, v_position, v_question ->> 'question_type',
      btrim(v_question ->> 'prompt'), v_question -> 'options',
      v_question -> 'answer_key', round((v_question ->> 'marks')::numeric, 2)
    );
    v_position := v_position + 1;
  end loop;

  return v_quiz_id;
end
$$;

revoke all on function public.create_quiz_with_questions(uuid, text, text, timestamptz, timestamptz, integer, integer, boolean, boolean, jsonb) from public, anon;
grant execute on function public.create_quiz_with_questions(uuid, text, text, timestamptz, timestamptz, integer, integer, boolean, boolean, jsonb) to authenticated;
