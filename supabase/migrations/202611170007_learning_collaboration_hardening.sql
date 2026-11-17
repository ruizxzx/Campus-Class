-- Restrict college course management to faculty assigned to that course's subject.
revoke all on function private.can_manage_class(uuid) from public, anon;
grant execute on function private.can_manage_class(uuid) to authenticated;

create or replace function private.can_manage_course(_college_id uuid, _subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(_college_id) or exists (
    select 1
    from public.classes c
    join public.class_faculty cf
      on cf.class_id = c.id
     and cf.college_id = c.college_id
    join public.profiles faculty
      on faculty.id = cf.faculty_id
     and faculty.college_id = cf.college_id
    where c.college_id = _college_id
      and c.college_id = private.current_college_id()
      and c.subject_id = _subject_id
      and cf.faculty_id = (select auth.uid())
      and faculty.role = 'faculty'
      and faculty.status = 'active'
  )
$$;

revoke all on function private.can_manage_course(uuid, uuid) from public, anon;
grant execute on function private.can_manage_course(uuid, uuid) to authenticated;

create or replace function private.can_view_stream_post(_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_stream_posts p
    where p.id = _post_id
      and p.college_id = private.current_college_id()
      and private.is_class_member(p.class_id)
      and (
        private.is_faculty_in_class(p.college_id, p.class_id)
        or private.is_admin(p.college_id)
        or (
          p.published_at is not null
          and p.published_at <= now()
          and (p.scheduled_at is null or p.scheduled_at <= now())
          and (
            p.visibility = 'class'
            or p.author_id = (select auth.uid())
            or exists (
              select 1
              from public.stream_targets st
              where st.college_id = p.college_id
                and st.post_id = p.id
                and st.student_id = (select auth.uid())
            )
          )
        )
      )
  )
$$;

revoke all on function private.can_view_stream_post(uuid) from public, anon;
grant execute on function private.can_view_stream_post(uuid) to authenticated;

-- Prevent cross-post comment threading in legacy data and enforce it going forward.
update public.stream_comments child
set parent_id = null
from public.stream_comments parent
where child.parent_id = parent.id
  and (child.college_id <> parent.college_id or child.post_id <> parent.post_id);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.stream_comments'::regclass
      and conname = 'stream_comments_college_post_id_key'
  ) then
    alter table public.stream_comments
      add constraint stream_comments_college_post_id_key unique (college_id, post_id, id);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.stream_comments'::regclass
      and conname = 'stream_comments_parent_same_post_fkey'
  ) then
    alter table public.stream_comments
      add constraint stream_comments_parent_same_post_fkey
      foreign key (college_id, post_id, parent_id)
      references public.stream_comments (college_id, post_id, id)
      on delete cascade;
  end if;
end
$$;

-- Topic ownership and class placement are immutable after creation.
drop policy if exists "class topics managed by assigned faculty or admin" on public.class_topics;
drop policy if exists "class topic managers insert topics" on public.class_topics;
drop policy if exists "class topic managers update topics" on public.class_topics;
drop policy if exists "class topic managers delete topics" on public.class_topics;
create policy "class topic managers insert topics" on public.class_topics
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and created_by = (select auth.uid())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
create policy "class topic managers update topics" on public.class_topics
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
create policy "class topic managers delete topics" on public.class_topics
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
revoke update on public.class_topics from public, anon, authenticated;
grant update (name, position) on public.class_topics to authenticated;

-- Stream authorship and resource links cannot be reassigned by row updates.
drop policy if exists "faculty and admins manage stream posts" on public.class_stream_posts;
drop policy if exists "stream posts visible to class members" on public.class_stream_posts;
drop policy if exists "class managers create stream posts" on public.class_stream_posts;
drop policy if exists "class managers update stream posts" on public.class_stream_posts;
drop policy if exists "class managers delete stream posts" on public.class_stream_posts;
create policy "stream posts visible to class members" on public.class_stream_posts
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and private.can_view_stream_post(id)
);
create policy "class managers create stream posts" on public.class_stream_posts
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and author_id = (select auth.uid())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
create policy "class managers update stream posts" on public.class_stream_posts
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
create policy "class managers delete stream posts" on public.class_stream_posts
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_faculty_in_class(college_id, class_id)
    or private.is_admin(college_id)
  )
);
revoke update on public.class_stream_posts from public, anon, authenticated;
grant update (topic_id, post_type, title, body, visibility, scheduled_at, published_at, pinned_at)
  on public.class_stream_posts to authenticated;

-- A target student must be an active student enrolled in the post's class.
drop policy if exists "stream targets visible to self or class manager" on public.stream_targets;
drop policy if exists "class manager controls stream targets" on public.stream_targets;
drop policy if exists "visible stream targets" on public.stream_targets;
drop policy if exists "class managers target enrolled students" on public.stream_targets;
drop policy if exists "class managers remove stream targets" on public.stream_targets;
create policy "visible stream targets" on public.stream_targets
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    (
      student_id = (select auth.uid())
      and private.can_view_stream_post(post_id)
    )
    or exists (
      select 1
      from public.class_stream_posts p
      where p.id = stream_targets.post_id
        and p.college_id = stream_targets.college_id
        and (
          private.is_faculty_in_class(p.college_id, p.class_id)
          or private.is_admin(p.college_id)
        )
    )
  )
);
create policy "class managers target enrolled students" on public.stream_targets
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.class_stream_posts p
    join public.class_enrollments ce
      on ce.college_id = p.college_id
     and ce.class_id = p.class_id
     and ce.student_id = stream_targets.student_id
     and ce.status = 'active'
    join public.profiles student
      on student.id = ce.student_id
     and student.college_id = ce.college_id
     and student.role = 'student'
     and student.status = 'active'
    where p.id = stream_targets.post_id
      and p.college_id = stream_targets.college_id
      and (
        private.is_faculty_in_class(p.college_id, p.class_id)
        or private.is_admin(p.college_id)
      )
  )
);
create policy "class managers remove stream targets" on public.stream_targets
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.class_stream_posts p
    where p.id = stream_targets.post_id
      and p.college_id = stream_targets.college_id
      and (
        private.is_faculty_in_class(p.college_id, p.class_id)
        or private.is_admin(p.college_id)
      )
  )
);
revoke update on public.stream_targets from public, anon, authenticated;

drop policy if exists "faculty manages stream attachments" on public.stream_attachments;
drop policy if exists "class managers add stream attachments" on public.stream_attachments;
drop policy if exists "class managers remove stream attachments" on public.stream_attachments;
create policy "class managers add stream attachments" on public.stream_attachments
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.class_stream_posts p
    where p.id = stream_attachments.post_id
      and p.college_id = stream_attachments.college_id
      and (
        private.is_faculty_in_class(p.college_id, p.class_id)
        or private.is_admin(p.college_id)
      )
  )
);
create policy "class managers remove stream attachments" on public.stream_attachments
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.class_stream_posts p
    where p.id = stream_attachments.post_id
      and p.college_id = stream_attachments.college_id
      and (
        private.is_faculty_in_class(p.college_id, p.class_id)
        or private.is_admin(p.college_id)
      )
  )
);
revoke update on public.stream_attachments from public, anon, authenticated;

drop policy if exists "participants create stream comments" on public.stream_comments;
drop policy if exists "class participants create stream comments" on public.stream_comments;
create policy "class participants create stream comments" on public.stream_comments
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and author_id = (select auth.uid())
  and exists (
    select 1
    from public.class_stream_posts p
    where p.id = stream_comments.post_id
      and p.college_id = stream_comments.college_id
      and p.published_at is not null
      and p.published_at <= now()
      and (p.scheduled_at is null or p.scheduled_at <= now())
  )
  and private.can_view_stream_post(post_id)
);

drop policy if exists "authors or class managers update stream comments" on public.stream_comments;
drop policy if exists "authors or class managers delete stream comments" on public.stream_comments;
create policy "authors or class managers update stream comments" on public.stream_comments
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and private.can_view_stream_post(post_id)
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.class_stream_posts p
      where p.id = stream_comments.post_id
        and (
          private.is_faculty_in_class(p.college_id, p.class_id)
          or private.is_admin(p.college_id)
        )
    )
  )
)
with check (
  college_id = (select private.current_college_id())
  and private.can_view_stream_post(post_id)
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.class_stream_posts p
      where p.id = stream_comments.post_id
        and (
          private.is_faculty_in_class(p.college_id, p.class_id)
          or private.is_admin(p.college_id)
        )
    )
  )
);
create policy "authors or class managers delete stream comments" on public.stream_comments
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and private.can_view_stream_post(post_id)
  and (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.class_stream_posts p
      where p.id = stream_comments.post_id
        and (
          private.is_faculty_in_class(p.college_id, p.class_id)
          or private.is_admin(p.college_id)
        )
    )
  )
);
revoke update on public.stream_comments from public, anon, authenticated;
grant update (body, is_private) on public.stream_comments to authenticated;

-- Chat participants can edit message text, but cannot move messages or impersonate senders.
drop policy if exists "class members send chat" on public.class_messages;
create policy "class members send chat" on public.class_messages
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and sender_id = (select auth.uid())
  and private.is_class_member(class_id)
);
drop policy if exists "sender or manager can moderate chat" on public.class_messages;
drop policy if exists "senders and class managers update chat" on public.class_messages;
create policy "senders and class managers update chat" on public.class_messages
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    (sender_id = (select auth.uid()) and private.is_class_member(class_id))
    or private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and (
    (
      sender_id = (select auth.uid())
      and private.is_class_member(class_id)
      and deleted_at is null
    )
    or private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);
revoke update on public.class_messages from public, anon, authenticated;
grant update (body, deleted_at) on public.class_messages to authenticated;

create or replace function private.set_class_message_edited_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end
$$;

revoke all on function private.set_class_message_edited_at() from public, anon, authenticated;
drop trigger if exists class_messages_set_edited_at on public.class_messages;
create trigger class_messages_set_edited_at
before update on public.class_messages
for each row execute function private.set_class_message_edited_at();

-- Students may only mark their own active-course published lessons complete.
drop policy if exists "students manage own lesson progress" on public.lesson_progress;
drop policy if exists "students view own lesson progress" on public.lesson_progress;
drop policy if exists "students complete published lessons" on public.lesson_progress;
create policy "students view own lesson progress" on public.lesson_progress
for select to authenticated
using (
  student_id = (select auth.uid())
  and college_id = (select private.current_college_id())
  and private.current_role() = 'student'
);
create policy "students complete published lessons" on public.lesson_progress
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and college_id = (select private.current_college_id())
  and private.current_role() = 'student'
  and exists (
    select 1
    from public.course_lessons lesson
    join public.course_modules module
      on module.id = lesson.module_id
     and module.college_id = lesson.college_id
    join public.courses course
      on course.id = module.course_id
     and course.college_id = module.college_id
    where lesson.id = lesson_progress.lesson_id
      and lesson.college_id = lesson_progress.college_id
      and lesson.is_published
      and course.status = 'active'
  )
);
revoke insert, update, delete on public.lesson_progress from public, anon, authenticated;
grant insert (college_id, lesson_id, student_id) on public.lesson_progress to authenticated;

-- Quiz metadata is visible to students only after publication. Question content is visible only
-- during the quiz window; answer keys remain unavailable through the Data API.
drop policy if exists "students and teachers view class quizzes" on public.quizzes;
drop policy if exists "class members view published quizzes" on public.quizzes;
create policy "class members view published quizzes" on public.quizzes
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
    or (
      status in ('published', 'closed')
      and private.is_enrolled_in_class(class_id)
    )
  )
);

drop policy if exists "assigned faculty manage quizzes" on public.quizzes;
drop policy if exists "class managers create quizzes" on public.quizzes;
drop policy if exists "class managers update quizzes" on public.quizzes;
drop policy if exists "class managers delete quizzes" on public.quizzes;
create policy "class managers create quizzes" on public.quizzes
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and created_by = (select auth.uid())
  and (
    private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);
create policy "class managers update quizzes" on public.quizzes
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);
create policy "class managers delete quizzes" on public.quizzes
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);
revoke update on public.quizzes from public, anon, authenticated;
grant update (
  title, description, opens_at, closes_at, duration_minutes, max_marks, attempts_allowed,
  shuffle_questions, show_score_after_submit, status
) on public.quizzes to authenticated;

drop policy if exists "quiz questions visible to class members" on public.quiz_questions;
drop policy if exists "quiz questions visible to class staff and open students" on public.quiz_questions;
revoke select (explanation) on public.quiz_questions from public, anon, authenticated;
create policy "quiz questions visible to class staff and open students" on public.quiz_questions
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.college_id = quiz_questions.college_id
      and (
        private.is_admin(q.college_id)
        or private.is_faculty_in_class(q.college_id, q.class_id)
        or (
          q.status = 'published'
          and private.is_enrolled_in_class(q.class_id)
          and (q.opens_at is null or q.opens_at <= now())
          and (q.closes_at is null or q.closes_at > now())
        )
      )
  )
);

drop policy if exists "assigned faculty manage quiz questions" on public.quiz_questions;
drop policy if exists "class managers manage quiz questions" on public.quiz_questions;
create policy "class managers manage quiz questions" on public.quiz_questions
for all to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.college_id = quiz_questions.college_id
      and (
        private.is_admin(q.college_id)
        or private.is_faculty_in_class(q.college_id, q.class_id)
      )
  )
)
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.college_id = quiz_questions.college_id
      and (
        private.is_admin(q.college_id)
        or private.is_faculty_in_class(q.college_id, q.class_id)
      )
  )
);

-- A student's attempt summary never exposes unreleased scores or answer payloads.
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
    qa.id,
    qa.attempt_number,
    qa.status,
    case
      when q.show_score_after_submit or qa.released_at is not null then qa.score
      else null
    end as score,
    qa.submitted_at,
    qa.released_at
  from public.quiz_attempts qa
  join public.quizzes q
    on q.id = qa.quiz_id
   and q.college_id = qa.college_id
  where qa.quiz_id = _quiz_id
    and qa.student_id = (select auth.uid())
    and private.current_role() = 'student'
    and private.is_enrolled_in_class(q.class_id)
  order by qa.attempt_number desc
$$;

revoke all on function public.get_my_quiz_attempts(uuid) from public, anon;
grant execute on function public.get_my_quiz_attempts(uuid) to authenticated;

drop policy if exists "students see released attempts and class managers see all" on public.quiz_attempts;
create policy "students see released attempts and class managers see all" on public.quiz_attempts
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    (student_id = (select auth.uid()) and released_at is not null)
    or exists (
      select 1
      from public.quizzes q
      where q.id = quiz_attempts.quiz_id
        and q.college_id = quiz_attempts.college_id
        and (
          private.is_admin(q.college_id)
          or private.is_faculty_in_class(q.college_id, q.class_id)
        )
    )
  )
);

alter table public.student_learning_stats
  add column if not exists last_activity_date date;

update public.student_learning_stats
set last_activity_date = updated_at::date
where last_activity_date is null
  and xp > 0;

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
  if jsonb_object_length(_answers) = 0 then
    raise exception using errcode = '22023', message = 'Quiz answers must be a non-empty JSON object.';
  end if;
  if octet_length(_answers::text) > 65536 or jsonb_object_length(_answers) > 500 then
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

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

drop policy if exists "students and admins view learning stats" on public.student_learning_stats;
create policy "students and admins view learning stats" on public.student_learning_stats
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    (student_id = (select auth.uid()) and private.current_role() = 'student')
    or private.is_admin(college_id)
    or exists (
      select 1
      from public.class_faculty f
      join public.class_enrollments e
        on e.college_id = f.college_id
       and e.class_id = f.class_id
      join public.profiles faculty
        on faculty.id = f.faculty_id
       and faculty.college_id = f.college_id
      join public.profiles student
        on student.id = e.student_id
       and student.college_id = e.college_id
      where f.faculty_id = (select auth.uid())
        and f.college_id = student_learning_stats.college_id
        and e.student_id = student_learning_stats.student_id
        and e.status = 'active'
        and faculty.role = 'faculty'
        and faculty.status = 'active'
        and student.role = 'student'
        and student.status = 'active'
    )
  )
);

-- Course managers must be assigned to the exact subject in the same college.
drop policy if exists "course catalog visible within college" on public.courses;
drop policy if exists "active course catalog and managed courses visible" on public.courses;
create policy "active course catalog and managed courses visible" on public.courses
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    status = 'active'
    or private.can_manage_course(college_id, subject_id)
  )
);

drop policy if exists "admins and assigned faculty manage courses" on public.courses;
drop policy if exists "course managers create courses" on public.courses;
drop policy if exists "course managers update courses" on public.courses;
drop policy if exists "course managers delete courses" on public.courses;
create policy "course managers create courses" on public.courses
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and private.can_manage_course(college_id, subject_id)
);
create policy "course managers update courses" on public.courses
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and private.can_manage_course(college_id, subject_id)
)
with check (
  college_id = (select private.current_college_id())
  and private.can_manage_course(college_id, subject_id)
);
create policy "course managers delete courses" on public.courses
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and private.can_manage_course(college_id, subject_id)
);
revoke update on public.courses from public, anon, authenticated;
grant update (title, description, syllabus, cover_path, status) on public.courses to authenticated;

drop policy if exists "course modules visible within college" on public.course_modules;
drop policy if exists "active course modules visible" on public.course_modules;
create policy "active course modules visible" on public.course_modules
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and c.college_id = course_modules.college_id
      and (
        c.status = 'active'
        or private.can_manage_course(c.college_id, c.subject_id)
      )
  )
);

drop policy if exists "course managers manage modules" on public.course_modules;
drop policy if exists "course managers insert modules" on public.course_modules;
drop policy if exists "course managers update modules" on public.course_modules;
drop policy if exists "course managers delete modules" on public.course_modules;
create policy "course managers insert modules" on public.course_modules
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.courses c
    where c.id = course_modules.course_id
      and c.college_id = course_modules.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
create policy "course managers update modules" on public.course_modules
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.courses c
    where c.id = course_modules.course_id
      and c.college_id = course_modules.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.courses c
    where c.id = course_modules.course_id
      and c.college_id = course_modules.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
create policy "course managers delete modules" on public.course_modules
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.courses c
    where c.id = course_modules.course_id
      and c.college_id = course_modules.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
revoke update on public.course_modules from public, anon, authenticated;
grant update (title, description, position) on public.course_modules to authenticated;

drop policy if exists "published course lessons visible within college" on public.course_lessons;
drop policy if exists "published lessons and managed lessons visible" on public.course_lessons;
create policy "published lessons and managed lessons visible" on public.course_lessons
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.course_modules m
    join public.courses c
      on c.id = m.course_id
     and c.college_id = m.college_id
    where m.id = course_lessons.module_id
      and m.college_id = course_lessons.college_id
      and (
        (c.status = 'active' and course_lessons.is_published)
        or private.can_manage_course(c.college_id, c.subject_id)
      )
  )
);

drop policy if exists "course managers manage lessons" on public.course_lessons;
drop policy if exists "course managers insert lessons" on public.course_lessons;
drop policy if exists "course managers update lessons" on public.course_lessons;
drop policy if exists "course managers delete lessons" on public.course_lessons;
create policy "course managers insert lessons" on public.course_lessons
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.course_modules m
    join public.courses c
      on c.id = m.course_id
     and c.college_id = m.college_id
    where m.id = course_lessons.module_id
      and m.college_id = course_lessons.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
create policy "course managers update lessons" on public.course_lessons
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.course_modules m
    join public.courses c
      on c.id = m.course_id
     and c.college_id = m.college_id
    where m.id = course_lessons.module_id
      and m.college_id = course_lessons.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.course_modules m
    join public.courses c
      on c.id = m.course_id
     and c.college_id = m.college_id
    where m.id = course_lessons.module_id
      and m.college_id = course_lessons.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
create policy "course managers delete lessons" on public.course_lessons
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1
    from public.course_modules m
    join public.courses c
      on c.id = m.course_id
     and c.college_id = m.college_id
    where m.id = course_lessons.module_id
      and m.college_id = course_lessons.college_id
      and private.can_manage_course(c.college_id, c.subject_id)
  )
);
revoke update on public.course_lessons from public, anon, authenticated;
grant update (
  title, body, plain_text, video_url, attachment_path, duration_minutes, position, is_published
) on public.course_lessons to authenticated;

drop policy if exists "admins award achievements" on public.student_achievements;
drop policy if exists "students view own achievements" on public.student_achievements;
drop policy if exists "admins revoke achievement awards" on public.student_achievements;
create policy "students view own achievements" on public.student_achievements
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    (student_id = (select auth.uid()) and private.current_role() = 'student')
    or private.is_admin(college_id)
  )
);
create policy "admins award achievements" on public.student_achievements
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and private.is_admin(college_id)
  and exists (
    select 1
    from public.profiles student
    where student.id = student_achievements.student_id
      and student.college_id = student_achievements.college_id
      and student.role = 'student'
      and student.status = 'active'
  )
);
create policy "admins revoke achievement awards" on public.student_achievements
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and private.is_admin(college_id)
);
revoke update on public.student_achievements from public, anon, authenticated;

-- Certificates are immutable credentials except for one-way revocation.
drop policy if exists "student and college admins view certificates" on public.academic_certificates;
drop policy if exists "students and admins view certificates" on public.academic_certificates;
create policy "students and admins view certificates" on public.academic_certificates
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and (
    student_id = (select auth.uid())
    or private.is_admin(college_id)
  )
);
drop policy if exists "admins issue and revoke certificates" on public.academic_certificates;
drop policy if exists "admins issue certificates" on public.academic_certificates;
drop policy if exists "admins revoke certificates" on public.academic_certificates;
create policy "admins issue certificates" on public.academic_certificates
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and issued_by = (select auth.uid())
  and private.is_admin(college_id)
  and exists (
    select 1 from public.profiles student
    where student.id = academic_certificates.student_id
      and student.college_id = academic_certificates.college_id
      and student.role = 'student'
      and student.status = 'active'
  )
);
create policy "admins revoke certificates" on public.academic_certificates
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and private.is_admin(college_id)
)
with check (
  college_id = (select private.current_college_id())
  and private.is_admin(college_id)
  and revoked_at is not null
);
revoke update, delete on public.academic_certificates from public, anon, authenticated;
grant update (revoked_at) on public.academic_certificates to authenticated;
drop policy if exists "admins delete certificates" on public.academic_certificates;

-- Keep mutable timestamps authoritative even when callers do not set them.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'class_stream_posts', 'stream_comments', 'personal_notes', 'todo_items', 'quizzes',
    'courses', 'course_modules', 'course_lessons', 'student_learning_stats'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;
