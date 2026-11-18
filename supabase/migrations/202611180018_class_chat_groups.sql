-- Class chat rooms are scoped to existing class sections; membership remains the room boundary.
alter table public.class_messages
  add column if not exists parent_id uuid,
  add column if not exists pinned_at timestamptz,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_ready boolean not null default true,
  add column if not exists reaction_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.class_messages'::regclass
      and conname = 'class_messages_college_class_id_key'
  ) then
    alter table public.class_messages
      add constraint class_messages_college_class_id_key unique (college_id, class_id, id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.class_messages'::regclass
      and conname = 'class_messages_parent_same_room_fkey'
  ) then
    alter table public.class_messages
      add constraint class_messages_parent_same_room_fkey
      foreign key (college_id, class_id, parent_id)
      references public.class_messages(college_id, class_id, id)
      on delete cascade;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.class_messages'::regclass
      and conname = 'class_messages_not_self_reply_check'
  ) then
    alter table public.class_messages
      add constraint class_messages_not_self_reply_check
      check (parent_id is null or parent_id <> id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.class_messages'::regclass
      and conname = 'class_messages_attachment_size_check'
  ) then
    alter table public.class_messages
      add constraint class_messages_attachment_size_check
      check (attachment_size is null or attachment_size between 1 and 20971520);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.class_messages'::regclass
      and conname = 'class_messages_attachment_path_check'
  ) then
    alter table public.class_messages
      add constraint class_messages_attachment_path_check
      check (
        attachment_path is null
        or attachment_path like college_id::text || '/' || class_id::text || '/' || id::text || '/%'
      );
  end if;
end
$$;

create table if not exists public.class_message_reactions (
  college_id uuid not null,
  class_id uuid not null,
  message_id uuid not null,
  user_id uuid not null,
  reaction text not null check (reaction in ('👍', '❤️', '🎉', '😄', '👀')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction),
  foreign key (college_id, class_id, message_id)
    references public.class_messages(college_id, class_id, id) on delete cascade,
  foreign key (college_id, user_id)
    references public.profiles(college_id, id) on delete cascade
);

create table if not exists public.class_chat_read_state (
  college_id uuid not null,
  class_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (class_id, user_id),
  foreign key (college_id, class_id)
    references public.classes(college_id, id) on delete cascade,
  foreign key (college_id, user_id)
    references public.profiles(college_id, id) on delete cascade
);

create index if not exists class_messages_parent_idx
  on public.class_messages(college_id, class_id, parent_id, created_at);
create index if not exists class_message_reactions_message_idx
  on public.class_message_reactions(college_id, class_id, message_id);

alter table public.class_message_reactions enable row level security;
alter table public.class_chat_read_state enable row level security;
drop policy if exists "class members read chat" on public.class_messages;
create policy "class members read chat" on public.class_messages
for select to authenticated
using (
  private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_messages.class_id
      and classroom.college_id = class_messages.college_id
      and classroom.is_active
  )
  and deleted_at is null
  and (attachment_path is null or attachment_ready)
);

drop policy if exists "class members send chat" on public.class_messages;
create policy "class members send chat" on public.class_messages
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and sender_id = (select auth.uid())
  and private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_messages.class_id
      and classroom.college_id = class_messages.college_id
      and classroom.is_active
  )
  and attachment_path is null
);

revoke all on public.class_message_reactions, public.class_chat_read_state from public, anon, authenticated;
grant select, insert, delete on public.class_message_reactions to authenticated;
grant select on public.class_chat_read_state to authenticated;

drop policy if exists "class members read message reactions" on public.class_message_reactions;
create policy "class members read message reactions" on public.class_message_reactions
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_message_reactions.class_id
      and classroom.college_id = class_message_reactions.college_id
      and classroom.is_active
  )
);

drop policy if exists "members react to visible messages" on public.class_message_reactions;
create policy "members react to visible messages" on public.class_message_reactions
for insert to authenticated
with check (
  college_id = (select private.current_college_id())
  and user_id = (select auth.uid())
  and private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_message_reactions.class_id
      and classroom.college_id = class_message_reactions.college_id
      and classroom.is_active
  )
  and exists (
    select 1 from public.class_messages message
    where message.id = class_message_reactions.message_id
      and message.college_id = class_message_reactions.college_id
      and message.class_id = class_message_reactions.class_id
      and message.deleted_at is null
  )
);

drop policy if exists "members remove own message reactions" on public.class_message_reactions;
create policy "members remove own message reactions" on public.class_message_reactions
for delete to authenticated
using (
  college_id = (select private.current_college_id())
  and private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_message_reactions.class_id
      and classroom.college_id = class_message_reactions.college_id
      and classroom.is_active
  )
  and (
    user_id = (select auth.uid())
    or private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);

drop policy if exists "users read own chat read state" on public.class_chat_read_state;
create policy "users read own chat read state" on public.class_chat_read_state
for select to authenticated
using (
  college_id = (select private.current_college_id())
  and user_id = (select auth.uid())
  and private.is_class_member(class_id)
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_chat_read_state.class_id
      and classroom.college_id = class_chat_read_state.college_id
      and classroom.is_active
  )
);

-- A sender may soft-delete their own post; class staff may moderate posts and pin via a separate RPC.
drop policy if exists "senders and class managers update chat" on public.class_messages;
create policy "senders and class managers update chat" on public.class_messages
for update to authenticated
using (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_messages.class_id
      and classroom.college_id = class_messages.college_id
      and classroom.is_active
  )
  and (
    (sender_id = (select auth.uid()) and private.is_class_member(class_id))
    or private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
)
with check (
  college_id = (select private.current_college_id())
  and exists (
    select 1 from public.classes classroom
    where classroom.id = class_messages.class_id
      and classroom.college_id = class_messages.college_id
      and classroom.is_active
  )
  and (
    (sender_id = (select auth.uid()) and private.is_class_member(class_id))
    or private.is_admin(college_id)
    or private.is_faculty_in_class(college_id, class_id)
  )
);
revoke insert, delete on public.class_messages from public, anon, authenticated;
revoke update (deleted_at, attachment_path, attachment_ready) on public.class_messages from public, anon, authenticated;

create or replace function private.verify_class_chat_attachment_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attachment_ready and not old.attachment_ready
     and not exists (
       select 1 from storage.objects object
       where object.bucket_id = 'class-chat'
         and object.name = new.attachment_path
     ) then
    raise exception using errcode = '23514', message = 'The uploaded chat attachment is not available.';
  end if;
  return new;
end
$$;

revoke all on function private.verify_class_chat_attachment_ready() from public, anon, authenticated;
drop trigger if exists class_chat_attachment_ready_guard on public.class_messages;
create trigger class_chat_attachment_ready_guard
before update of attachment_ready on public.class_messages
for each row execute function private.verify_class_chat_attachment_ready();

create or replace function public.toggle_class_message_reaction(_message_id uuid, _reaction text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_college_id uuid := private.current_college_id();
  v_class_id uuid;
begin
  if v_user_id is null or v_college_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if _reaction not in ('👍', '❤️', '🎉', '😄', '👀') then
    raise exception using errcode = '22023', message = 'Unsupported reaction.';
  end if;

  select message.class_id into v_class_id
  from public.class_messages message
  join public.classes classroom
    on classroom.college_id = message.college_id
   and classroom.id = message.class_id
   and classroom.is_active
  where message.id = _message_id
    and message.college_id = v_college_id
    and message.deleted_at is null
    and private.is_class_member(message.class_id);
  if not found then
    raise exception using errcode = '42501', message = 'This message is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(_message_id::text || ':' || v_user_id::text || ':' || _reaction, 0)
  );
  if exists (
    select 1 from public.class_message_reactions reaction
    where reaction.message_id = _message_id
      and reaction.user_id = v_user_id
      and reaction.reaction = _reaction
  ) then
    delete from public.class_message_reactions reaction
    where reaction.message_id = _message_id
      and reaction.user_id = v_user_id
      and reaction.reaction = _reaction;
    update public.class_messages message
    set reaction_updated_at = now()
    where message.id = _message_id
      and message.college_id = v_college_id;
    return false;
  end if;

  insert into public.class_message_reactions (college_id, class_id, message_id, user_id, reaction)
  values (v_college_id, v_class_id, _message_id, v_user_id, _reaction);
  update public.class_messages message
  set reaction_updated_at = now()
  where message.id = _message_id
    and message.college_id = v_college_id;
  return true;
end
$$;

create or replace function public.toggle_class_message_pin(_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_college_id uuid := private.current_college_id();
  v_class_id uuid;
  v_is_pinned boolean;
begin
  if v_college_id is null
     or not (
       private.is_admin(v_college_id)
       or exists (
         select 1 from public.class_messages message
         join public.classes classroom
           on classroom.college_id = message.college_id
          and classroom.id = message.class_id
          and classroom.is_active
         where message.id = _message_id
           and message.college_id = v_college_id
           and private.is_faculty_in_class(v_college_id, message.class_id)
       )
     ) then
    raise exception using errcode = '42501', message = 'Only class staff can pin messages.';
  end if;

  select message.class_id into v_class_id
  from public.class_messages message
  join public.classes classroom
    on classroom.college_id = message.college_id
   and classroom.id = message.class_id
   and classroom.is_active
  where message.id = _message_id
    and message.college_id = v_college_id
    and message.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'This message is unavailable.';
  end if;

  update public.class_messages message
  set pinned_at = case when message.pinned_at is null then now() else null end
  where message.id = _message_id
    and message.college_id = v_college_id
  returning message.pinned_at is not null into v_is_pinned;
  return v_is_pinned;
end
$$;

create or replace function public.mark_class_chat_read(_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_college_id uuid := private.current_college_id();
begin
  if v_user_id is null or v_college_id is null
     or not private.is_class_member(_class_id)
     or not exists (
       select 1 from public.classes classroom
       where classroom.id = _class_id
         and classroom.college_id = v_college_id
         and classroom.is_active
     ) then
    raise exception using errcode = '42501', message = 'You cannot access this class chat.';
  end if;

  insert into public.class_chat_read_state (college_id, class_id, user_id, last_read_at)
  values (v_college_id, _class_id, v_user_id, now())
  on conflict (class_id, user_id) do update
  set last_read_at = excluded.last_read_at;
end
$$;

create or replace function public.get_my_class_chat_summaries()
returns table (
  class_id uuid,
  last_message_at timestamptz,
  last_message text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    classroom.id,
    latest.created_at,
    latest.body,
    coalesce((
      select count(*)
      from public.class_messages message
      where message.college_id = classroom.college_id
        and message.class_id = classroom.id
        and message.deleted_at is null
        and message.sender_id <> (select auth.uid())
        and (read_state.last_read_at is null or message.created_at > read_state.last_read_at)
    ), 0)::bigint
  from public.classes classroom
  left join public.class_chat_read_state read_state
    on read_state.college_id = classroom.college_id
   and read_state.class_id = classroom.id
   and read_state.user_id = (select auth.uid())
  left join lateral (
    select message.created_at, message.body
    from public.class_messages message
    where message.college_id = classroom.college_id
      and message.class_id = classroom.id
      and message.deleted_at is null
    order by message.created_at desc
    limit 1
  ) latest on true
  where classroom.college_id = private.current_college_id()
    and classroom.is_active
    and private.is_class_member(classroom.id)
  order by latest.created_at desc nulls last
$$;

create or replace function private.notify_class_chat_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.attachment_ready or not new.attachment_ready then
      return new;
    end if;
  elsif new.attachment_path is not null and not new.attachment_ready then
    return new;
  end if;

  insert into public.notifications (
    college_id, user_id, type, title, body, href, reference_key
  )
  select new.college_id,
         recipient.user_id,
         'class_chat_message',
         'New class chat message',
         'A message was posted in your class section.',
         '/chat/' || new.class_id::text,
         'class-chat-message:' || new.id::text
  from (
    select enrollment.student_id as user_id
    from public.class_enrollments enrollment
    join public.profiles student
      on student.id = enrollment.student_id
     and student.college_id = enrollment.college_id
    where enrollment.college_id = new.college_id
      and enrollment.class_id = new.class_id
      and enrollment.status = 'active'
      and student.status = 'active'
      and student.role = 'student'
    union
    select assignment.faculty_id as user_id
    from public.class_faculty assignment
    join public.profiles faculty
      on faculty.id = assignment.faculty_id
     and faculty.college_id = assignment.college_id
    where assignment.college_id = new.college_id
      and assignment.class_id = new.class_id
      and faculty.status = 'active'
      and faculty.role = 'faculty'
    union
    select profile.id
    from public.profiles profile
    where profile.college_id = new.college_id
      and profile.role = 'admin'
      and profile.status = 'active'
  ) recipient
  where recipient.user_id <> new.sender_id
  on conflict (user_id, reference_key) do nothing;
  return new;
end
$$;

revoke all on function public.toggle_class_message_reaction(uuid, text) from public, anon;
revoke all on function public.toggle_class_message_pin(uuid) from public, anon;
revoke all on function public.mark_class_chat_read(uuid) from public, anon;
revoke all on function public.get_my_class_chat_summaries() from public, anon;
revoke all on function private.notify_class_chat_recipients() from public, anon, authenticated;
grant execute on function public.toggle_class_message_reaction(uuid, text) to authenticated;
grant execute on function public.toggle_class_message_pin(uuid) to authenticated;
grant execute on function public.mark_class_chat_read(uuid) to authenticated;
grant execute on function public.get_my_class_chat_summaries() to authenticated;

drop trigger if exists class_chat_notify_recipients on public.class_messages;
create trigger class_chat_notify_recipients
after insert or update of attachment_ready on public.class_messages
for each row execute function private.notify_class_chat_recipients();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-chat',
  'class-chat',
  false,
  20971520,
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

drop policy if exists "class members read chat attachments" on storage.objects;
create policy "class members read chat attachments" on storage.objects
for select to authenticated
using (
  bucket_id = 'class-chat'
  and exists (
    select 1
    from public.class_messages message
    where message.attachment_path = name
      and message.college_id = private.safe_uuid((storage.foldername(name))[1])
      and message.class_id = private.safe_uuid((storage.foldername(name))[2])
      and message.id = private.safe_uuid((storage.foldername(name))[3])
      and message.deleted_at is null
      and message.attachment_ready
      and exists (
        select 1 from public.classes classroom
        where classroom.id = message.class_id
          and classroom.college_id = message.college_id
          and classroom.is_active
      )
      and private.is_class_member(message.class_id)
  )
);

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_messages'
    ) then
      alter publication supabase_realtime add table public.class_messages;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'class_message_reactions'
    ) then
      alter publication supabase_realtime add table public.class_message_reactions;
    end if;
  end if;
end
$$;
