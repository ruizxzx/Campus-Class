-- CampusClass Build 1.3: notify enrolled students and post authors about stream activity.

create or replace function private.notify_stream_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_at is not null and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.published_at is null)
  ) then
    insert into public.notifications (college_id, user_id, type, title, body, href, reference_key)
    select new.college_id, enrollment.student_id, 'stream_post',
      new.title, left(new.body, 240), '/stream/' || new.id::text,
      'stream-post:' || new.id::text || ':' || enrollment.student_id::text
    from public.class_enrollments enrollment
    join public.profiles student
      on student.id = enrollment.student_id
     and student.college_id = enrollment.college_id
     and student.status = 'active'
     and student.role = 'student'
    where enrollment.college_id = new.college_id
      and enrollment.class_id = new.class_id
      and enrollment.status = 'active'
      and enrollment.student_id <> new.author_id
      and (
        new.visibility = 'class'
        or exists (
          select 1
          from public.stream_targets target
          where target.college_id = new.college_id
            and target.post_id = new.id
            and target.student_id = enrollment.student_id
        )
      )
    on conflict (user_id, reference_key) do nothing;
  end if;
  return new;
end
$$;

create or replace function private.notify_stream_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.class_stream_posts%rowtype;
begin
  select * into post from public.class_stream_posts where id = new.post_id and college_id = new.college_id;
  if post.author_id is not null and post.author_id <> new.author_id then
    insert into public.notifications (college_id, user_id, type, title, body, href, reference_key)
    values (new.college_id, post.author_id, 'stream_comment', 'New comment on ' || post.title,
      left(new.body, 240), '/stream/' || post.id::text,
      'stream-comment:' || new.id::text)
    on conflict (user_id, reference_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists stream_post_activity_notification on public.class_stream_posts;
create trigger stream_post_activity_notification
after insert or update of published_at on public.class_stream_posts
for each row execute function private.notify_stream_post_activity();

drop trigger if exists stream_comment_activity_notification on public.stream_comments;
create trigger stream_comment_activity_notification
after insert on public.stream_comments
for each row execute function private.notify_stream_comment_activity();

revoke all on function private.notify_stream_post_activity() from public, anon, authenticated;
revoke all on function private.notify_stream_comment_activity() from public, anon, authenticated;
