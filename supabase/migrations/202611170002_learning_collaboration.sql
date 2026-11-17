
-- CampusClass 1.1: college-scoped learning, collaboration and engagement.
-- Adapted from common LMS workflows; all records retain explicit college scope.

create table if not exists public.class_topics (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  position integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (college_id, id),
  unique (class_id, name),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.class_stream_posts (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  author_id uuid not null,
  topic_id uuid,
  post_type text not null default 'announcement'
    check (post_type in ('announcement','assignment','quiz','question','material','poll')),
  title text not null check (char_length(title) between 2 and 180),
  body text not null default '',
  visibility text not null default 'class'
    check (visibility in ('class','selected_students')),
  scheduled_at timestamptz,
  published_at timestamptz,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, author_id) references public.profiles(college_id, id) on delete restrict,
  foreign key (topic_id) references public.class_topics(id) on delete set null
);

create table if not exists public.stream_targets (
  college_id uuid not null,
  post_id uuid not null,
  student_id uuid not null,
  primary key (post_id, student_id),
  foreign key (college_id, post_id) references public.class_stream_posts(college_id, id) on delete cascade,
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.stream_attachments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  post_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size between 0 and 31457280),
  created_at timestamptz not null default now(),
  foreign key (college_id, post_id) references public.class_stream_posts(college_id, id) on delete cascade
);

create table if not exists public.stream_comments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  post_id uuid not null,
  author_id uuid not null,
  parent_id uuid,
  body text not null check (char_length(body) between 1 and 10000),
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, post_id) references public.class_stream_posts(college_id, id) on delete cascade,
  foreign key (college_id, author_id) references public.profiles(college_id, id) on delete restrict,
  foreign key (college_id, parent_id) references public.stream_comments(college_id, id) on delete cascade
);

create table if not exists public.class_messages (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 5000),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, sender_id) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  user_id uuid not null,
  title text not null check (char_length(title) between 1 and 180),
  content jsonb not null default '{}'::jsonb,
  plain_text text not null default '',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, user_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  user_id uuid not null,
  assignment_id uuid,
  title text not null check (char_length(title) between 1 and 180),
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','missing','completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (college_id, id),
  unique (user_id, assignment_id),
  foreign key (college_id, user_id) references public.profiles(college_id, id) on delete cascade,
  foreign key (college_id, assignment_id) references public.assignments(college_id, id) on delete cascade
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  class_id uuid not null,
  created_by uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  description text,
  opens_at timestamptz,
  closes_at timestamptz,
  duration_minutes integer check (duration_minutes between 1 and 600),
  max_marks numeric(8,2) not null default 100 check (max_marks > 0),
  attempts_allowed integer not null default 1 check (attempts_allowed between 1 and 20),
  shuffle_questions boolean not null default false,
  show_score_after_submit boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, class_id) references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, created_by) references public.profiles(college_id, id) on delete restrict
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  quiz_id uuid not null,
  position integer not null,
  question_type text not null check (question_type in ('multiple_choice','multiple_select','true_false','short_answer')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer_key jsonb,
  explanation text,
  marks numeric(8,2) not null default 1 check (marks > 0),
  created_at timestamptz not null default now(),
  unique (college_id, id),
  unique (quiz_id, position),
  foreign key (college_id, quiz_id) references public.quizzes(college_id, id) on delete cascade
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  quiz_id uuid not null,
  student_id uuid not null,
  attempt_number integer not null,
  answers jsonb not null default '{}'::jsonb,
  score numeric(8,2),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','graded','returned')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  released_at timestamptz,
  unique (college_id, id),
  unique (quiz_id, student_id, attempt_number),
  foreign key (college_id, quiz_id) references public.quizzes(college_id, id) on delete cascade,
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  subject_id uuid not null,
  title text not null,
  description text,
  syllabus jsonb not null default '[]'::jsonb,
  cover_path text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, subject_id) references public.subjects(college_id, id) on delete cascade
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  course_id uuid not null,
  title text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, course_id) references public.courses(college_id, id) on delete cascade
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  module_id uuid not null,
  title text not null,
  body jsonb not null default '{}'::jsonb,
  plain_text text not null default '',
  video_url text,
  attachment_path text,
  duration_minutes integer,
  position integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (college_id, id),
  foreign key (college_id, module_id) references public.course_modules(college_id, id) on delete cascade
);

create table if not exists public.lesson_progress (
  college_id uuid not null,
  lesson_id uuid not null,
  student_id uuid not null,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, student_id),
  foreign key (college_id, lesson_id) references public.course_lessons(college_id, id) on delete cascade,
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.student_learning_stats (
  college_id uuid not null,
  student_id uuid not null,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  updated_at timestamptz not null default now(),
  primary key (student_id),
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  key text not null,
  name text not null,
  description text,
  icon text,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  unique (college_id, id),
  unique (college_id, key),
  foreign key (college_id) references public.colleges(id) on delete cascade
);

create table if not exists public.student_achievements (
  college_id uuid not null,
  student_id uuid not null,
  achievement_id uuid not null,
  awarded_at timestamptz not null default now(),
  primary key (student_id, achievement_id),
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade,
  foreign key (college_id, achievement_id) references public.achievements(college_id, id) on delete cascade
);

create table if not exists public.academic_certificates (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null,
  student_id uuid not null,
  course_id uuid not null,
  certificate_number text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (college_id, id),
  unique (college_id, certificate_number),
  foreign key (college_id, student_id) references public.profiles(college_id, id) on delete cascade,
  foreign key (college_id, course_id) references public.courses(college_id, id) on delete cascade,
  foreign key (college_id, issued_by) references public.profiles(college_id, id) on delete restrict
);

-- RLS helpers use the already-established college/role helpers from the core migration.
create or replace function private.is_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_access_class(p_class_id);
$$;

create or replace function private.is_faculty_in_class(_college_id uuid, _class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_faculty cf
    join public.profiles p on p.id = cf.faculty_id and p.college_id = cf.college_id
    where cf.college_id = _college_id
      and cf.class_id = _class_id
      and cf.faculty_id = (select auth.uid())
      and p.role = 'faculty'
      and p.status = 'active'
  )
$$;

create or replace function private.can_view_stream_post(_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_stream_posts p
    where p.id = _post_id
      and (
        private.is_admin(p.college_id)
        or p.author_id = (select auth.uid())
        or (
          p.published_at is not null
          and private.is_class_member(p.class_id)
          and (
            p.visibility = 'class'
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

create or replace function public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quiz public.quizzes%rowtype;
  v_attempt_count integer;
  v_attempt_id uuid;
  v_total_score numeric(8,2) := 0;
  v_q record;
  v_has_answer_keys boolean := false;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(_quiz_id::text || ':' || v_user_id::text, 0)
  );

  select q.* into v_quiz
  from public.quizzes q
  where q.id = _quiz_id
    and q.status = 'published'
    and (q.opens_at is null or q.opens_at <= now())
    and (q.closes_at is null or q.closes_at > now());
  if not found or not private.is_class_member(v_quiz.class_id) then
    raise exception using errcode = '42501', message = 'This quiz is unavailable to the current student.';
  end if;

  select count(*) into v_attempt_count
  from public.quiz_attempts qa
  where qa.quiz_id = v_quiz.id and qa.student_id = v_user_id;
  if v_attempt_count >= v_quiz.attempts_allowed then
    raise exception using errcode = '42501', message = 'No quiz attempts remain.';
  end if;

  -- Auto-grade questions where an answer_key is present
  for v_q in (
    select qq.id, qq.question_type, qq.answer_key, qq.marks
    from public.quiz_questions qq
    where qq.quiz_id = v_quiz.id
  ) loop
    if v_q.answer_key is not null then
      v_has_answer_keys := true;
      if _answers ? v_q.id::text then
        if (_answers ->> v_q.id::text) = (v_q.answer_key #>> '{}')
           or (_answers -> v_q.id::text) = v_q.answer_key then
          v_total_score := v_total_score + v_q.marks;
        end if;
      end if;
    end if;
  end loop;

  insert into public.quiz_attempts (
    college_id, quiz_id, student_id, attempt_number, answers, score, status, submitted_at, released_at
  ) values (
    v_quiz.college_id, v_quiz.id, v_user_id, v_attempt_count + 1, _answers,
    case when v_has_answer_keys then v_total_score else null end,
    case when v_has_answer_keys and v_quiz.show_score_after_submit then 'graded' else 'submitted' end,
    now(),
    case when v_has_answer_keys and v_quiz.show_score_after_submit then now() else null end
  )
  returning id into v_attempt_id;

  -- Award student XP and streak
  insert into public.student_learning_stats (college_id, student_id, xp, level, current_streak, longest_streak)
  values (v_quiz.college_id, v_user_id, 25, 1, 1, 1)
  on conflict (student_id) do update set
    xp = student_learning_stats.xp + 25,
    level = (student_learning_stats.xp + 25) / 100 + 1,
    current_streak = student_learning_stats.current_streak + 1,
    longest_streak = greatest(student_learning_stats.longest_streak, student_learning_stats.current_streak + 1),
    updated_at = now();

  return v_attempt_id;
end
$$;

-- Security-definer helpers are in the non-exposed private schema, check auth.uid() in their queries,
-- and are only executable by authenticated (and not anon).
revoke all on function private.is_class_member(uuid) from public, anon;
grant execute on function private.is_class_member(uuid) to authenticated;
revoke all on function private.is_faculty_in_class(uuid, uuid) from public, anon;
grant execute on function private.is_faculty_in_class(uuid, uuid) to authenticated;
revoke all on function private.can_view_stream_post(uuid) from public, anon;
grant execute on function private.can_view_stream_post(uuid) to authenticated;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'class_topics','class_stream_posts','stream_targets','stream_attachments','stream_comments',
    'class_messages','personal_notes','todo_items','quizzes','quiz_attempts',
    'courses','course_modules','course_lessons','lesson_progress','student_learning_stats',
    'achievements','student_achievements','academic_certificates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;


-- Quiz answers are deliberately not exposed to authenticated clients.
alter table public.quiz_questions enable row level security;
revoke all on public.quiz_questions from anon, authenticated;
grant select (id, college_id, quiz_id, position, question_type, prompt, options, explanation, marks, created_at),
      insert, update, delete on public.quiz_questions to authenticated;

-- Topics and class streams.
create policy "class topics visible to class members" on public.class_topics for select to authenticated
using (private.is_class_member(class_id));
create policy "class topics managed by assigned faculty or admin" on public.class_topics for all to authenticated
using (private.is_faculty_in_class(college_id, class_id) or private.is_admin(college_id))
with check (private.is_faculty_in_class(college_id, class_id) or private.is_admin(college_id));

create policy "stream posts visible to class members" on public.class_stream_posts for select to authenticated
using (private.can_view_stream_post(id));
create policy "faculty and admins manage stream posts" on public.class_stream_posts for all to authenticated
using (private.is_faculty_in_class(college_id, class_id) or private.is_admin(college_id))
with check (private.is_faculty_in_class(college_id, class_id) or private.is_admin(college_id));

create policy "stream targets visible to self or class manager" on public.stream_targets for select to authenticated
using (student_id = (select auth.uid()) or exists (
  select 1 from public.class_stream_posts p where p.id = post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))
));
create policy "class manager controls stream targets" on public.stream_targets for all to authenticated
using (exists (select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))))
with check (exists (select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))));

create policy "stream attachments visible through post" on public.stream_attachments for select to authenticated
using (private.can_view_stream_post(post_id));
create policy "faculty manages stream attachments" on public.stream_attachments for all to authenticated
using (exists (select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))))
with check (exists (select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))));

create policy "stream comments visible to class participants" on public.stream_comments for select to authenticated
using (
  private.can_view_stream_post(post_id)
  and (not is_private or author_id = (select auth.uid()) or exists (
    select 1 from public.class_stream_posts p where p.id=post_id
    and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))
  ))
);
create policy "participants create stream comments" on public.stream_comments for insert to authenticated
with check (
  author_id = (select auth.uid()) and private.can_view_stream_post(post_id)
);
create policy "authors or class managers update stream comments" on public.stream_comments for update to authenticated
using (private.can_view_stream_post(post_id) and (author_id=(select auth.uid()) or exists (
  select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))
)))
with check (private.can_view_stream_post(post_id) and (author_id=(select auth.uid()) or exists (
  select 1 from public.class_stream_posts p where p.id=post_id
  and (private.is_faculty_in_class(p.college_id,p.class_id) or private.is_admin(p.college_id))
)));

-- Class messaging: members can read, only themselves can send as themselves.
create policy "class members read chat" on public.class_messages for select to authenticated
using (private.is_class_member(class_id) and deleted_at is null);
create policy "class members send chat" on public.class_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and private.is_class_member(class_id));
create policy "sender or manager can moderate chat" on public.class_messages for update to authenticated
using (sender_id=(select auth.uid()) or exists (select 1 from public.classes c where c.id=class_id
 and private.is_admin(c.college_id)))
with check (sender_id=(select auth.uid()) or exists (select 1 from public.classes c where c.id=class_id
 and private.is_admin(c.college_id)));

-- Personal notes and to-do are user-isolated.
create policy "users manage own notes" on public.personal_notes for all to authenticated
using (user_id=(select auth.uid()) and college_id = (select private.current_college_id()))
with check (user_id=(select auth.uid()) and college_id = (select private.current_college_id()));
create policy "users manage own todo" on public.todo_items for all to authenticated
using (user_id=(select auth.uid()) and college_id = (select private.current_college_id()))
with check (user_id=(select auth.uid()) and college_id = (select private.current_college_id()));

-- Quizzes and exams.
create policy "students and teachers view class quizzes" on public.quizzes for select to authenticated
using (private.is_class_member(class_id));
create policy "assigned faculty manage quizzes" on public.quizzes for all to authenticated
using (private.is_faculty_in_class(college_id,class_id) or private.is_admin(college_id))
with check (private.is_faculty_in_class(college_id,class_id) or private.is_admin(college_id));
create policy "quiz questions visible to class members" on public.quiz_questions for select to authenticated
using (exists (select 1 from public.quizzes q where q.id=quiz_id and private.is_class_member(q.class_id)));
create policy "assigned faculty manage quiz questions" on public.quiz_questions for all to authenticated
using (exists (select 1 from public.quizzes q where q.id=quiz_id and
 (private.is_faculty_in_class(q.college_id,q.class_id) or private.is_admin(q.college_id))))
with check (exists (select 1 from public.quizzes q where q.id=quiz_id and
 (private.is_faculty_in_class(q.college_id,q.class_id) or private.is_admin(q.college_id))));
create policy "students and managers view quiz attempts" on public.quiz_attempts for select to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.quizzes q where q.id = quiz_id
      and (private.is_faculty_in_class(q.college_id,q.class_id) or private.is_admin(q.college_id))
  )
);
revoke insert, update, delete on public.quiz_attempts from anon, authenticated;

-- College-owned structured courses, lessons, progress and certificates.
create policy "course catalog visible within college" on public.courses for select to authenticated
using (college_id = (select private.current_college_id()));
create policy "admins and assigned faculty manage courses" on public.courses for all to authenticated
using (private.is_admin(college_id) or exists (select 1 from public.classes c
 join public.class_faculty f on f.class_id=c.id where c.subject_id=subject_id and f.faculty_id=(select auth.uid())))
with check (private.is_admin(college_id) or exists (select 1 from public.classes c
 join public.class_faculty f on f.class_id=c.id where c.subject_id=subject_id and f.faculty_id=(select auth.uid())));

create policy "course modules visible within college" on public.course_modules for select to authenticated
using (college_id = (select private.current_college_id()));
create policy "course managers manage modules" on public.course_modules for all to authenticated
using (exists (select 1 from public.courses c where c.id=course_id and
 (private.is_admin(c.college_id) or exists (select 1 from public.classes cl join public.class_faculty f on f.class_id=cl.id
 where cl.subject_id=c.subject_id and f.faculty_id=(select auth.uid())))))
with check (exists (select 1 from public.courses c where c.id=course_id and
 (private.is_admin(c.college_id) or exists (select 1 from public.classes cl join public.class_faculty f on f.class_id=cl.id
 where cl.subject_id=c.subject_id and f.faculty_id=(select auth.uid())))));

create policy "published course lessons visible within college" on public.course_lessons for select to authenticated
using (is_published and college_id = (select private.current_college_id()) or exists (
 select 1 from public.course_modules m join public.courses c on c.id=m.course_id
 where m.id=module_id and (private.is_admin(c.college_id) or exists
  (select 1 from public.classes cl join public.class_faculty f on f.class_id=cl.id
   where cl.subject_id=c.subject_id and f.faculty_id=(select auth.uid())))));
create policy "course managers manage lessons" on public.course_lessons for all to authenticated
using (exists (select 1 from public.course_modules m join public.courses c on c.id=m.course_id
 where m.id=module_id and (private.is_admin(c.college_id) or exists
 (select 1 from public.classes cl join public.class_faculty f on f.class_id=cl.id
  where cl.subject_id=c.subject_id and f.faculty_id=(select auth.uid())))))
with check (exists (select 1 from public.course_modules m join public.courses c on c.id=m.course_id
 where m.id=module_id and (private.is_admin(c.college_id) or exists
 (select 1 from public.classes cl join public.class_faculty f on f.class_id=cl.id
  where cl.subject_id=c.subject_id and f.faculty_id=(select auth.uid())))));

create policy "students manage own lesson progress" on public.lesson_progress for all to authenticated
using (student_id=(select auth.uid()) and college_id = (select private.current_college_id()))
with check (student_id=(select auth.uid()) and college_id = (select private.current_college_id()));
create policy "students and admins view learning stats" on public.student_learning_stats for select to authenticated
using (student_id=(select auth.uid()) or private.is_admin(college_id)
 or exists (
   select 1
   from public.class_faculty f
   join public.class_enrollments e
     on e.college_id = f.college_id and e.class_id = f.class_id
   join public.profiles faculty
     on faculty.id = f.faculty_id and faculty.college_id = f.college_id
   where f.faculty_id = (select auth.uid())
     and f.college_id = student_learning_stats.college_id
     and e.student_id = student_learning_stats.student_id
     and e.status = 'active'
     and faculty.role = 'faculty'
     and faculty.status = 'active'
 ));
revoke insert, update, delete on public.student_learning_stats from anon, authenticated;

create policy "college achievements visible" on public.achievements for select to authenticated
using (college_id = (select private.current_college_id()));
create policy "admins manage achievements" on public.achievements for all to authenticated
using (private.is_admin(college_id))
with check (private.is_admin(college_id));
create policy "students view own achievements" on public.student_achievements for select to authenticated
using (student_id=(select auth.uid()) or private.is_admin(college_id));
create policy "admins award achievements" on public.student_achievements for all to authenticated
using (private.is_admin(college_id))
with check (private.is_admin(college_id));

create policy "student and college admins view certificates" on public.academic_certificates for select to authenticated
using (student_id=(select auth.uid()) or private.is_admin(college_id));
create policy "admins issue and revoke certificates" on public.academic_certificates for all to authenticated
using (private.is_admin(college_id))
with check (private.is_admin(college_id));

-- Useful indexes.
create index if not exists idx_stream_class_published on public.class_stream_posts(class_id,published_at desc);
create index if not exists idx_messages_class_created on public.class_messages(class_id,created_at desc);
create index if not exists idx_notes_owner_updated on public.personal_notes(user_id,updated_at desc);
create index if not exists idx_quizzes_class_window on public.quizzes(class_id,opens_at,closes_at);
create index if not exists idx_courses_subject on public.courses(subject_id);
create index if not exists idx_lessons_module_position on public.course_lessons(module_id,position);

-- Auto-set college_id triggers to guarantee consistency even if omitted by client inserts.
create or replace function private.auto_set_tenant_college_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.college_id is null then
    new.college_id := private.current_college_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notes_set_college on public.personal_notes;
create trigger trg_notes_set_college before insert on public.personal_notes
for each row execute function private.auto_set_tenant_college_id();

drop trigger if exists trg_todo_set_college on public.todo_items;
create trigger trg_todo_set_college before insert on public.todo_items
for each row execute function private.auto_set_tenant_college_id();

create or replace function private.auto_set_message_college()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.college_id is null then
    select c.college_id into new.college_id from public.classes c where c.id = new.class_id;
    if new.college_id is null then
      new.college_id := private.current_college_id();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_messages_set_college on public.class_messages;
create trigger trg_messages_set_college before insert on public.class_messages
for each row execute function private.auto_set_message_college();

create or replace function private.auto_set_comment_college()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.college_id is null then
    select p.college_id into new.college_id from public.class_stream_posts p where p.id = new.post_id;
    if new.college_id is null then
      new.college_id := private.current_college_id();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_comments_set_college on public.stream_comments;
create trigger trg_comments_set_college before insert on public.stream_comments
for each row execute function private.auto_set_comment_college();

create or replace function private.auto_set_lesson_progress_college()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.college_id is null then
    select m.college_id into new.college_id
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    where l.id = new.lesson_id;
    if new.college_id is null then
      new.college_id := private.current_college_id();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lesson_progress_set_college on public.lesson_progress;
create trigger trg_lesson_progress_set_college before insert on public.lesson_progress
for each row execute function private.auto_set_lesson_progress_college();

-- Award learning XP on lesson completion
create or replace function private.on_lesson_progress_award_xp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.student_learning_stats (college_id, student_id, xp, level, current_streak, longest_streak)
  values (new.college_id, new.student_id, 15, 1, 1, 1)
  on conflict (student_id) do update set
    xp = student_learning_stats.xp + 15,
    level = (student_learning_stats.xp + 15) / 100 + 1,
    current_streak = student_learning_stats.current_streak + 1,
    longest_streak = greatest(student_learning_stats.longest_streak, student_learning_stats.current_streak + 1),
    updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_lesson_progress_xp on public.lesson_progress;
create trigger trg_lesson_progress_xp after insert on public.lesson_progress
for each row execute function private.on_lesson_progress_award_xp();

