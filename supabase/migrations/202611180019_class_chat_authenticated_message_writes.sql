grant usage on schema public to service_role;
grant select, insert on public.class_messages to service_role;
grant update (deleted_at, attachment_ready) on public.class_messages to service_role;

create or replace function public.send_class_chat_message(
  _class_id uuid,
  _body text,
  _parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_college_id uuid := private.current_college_id();
  v_message public.class_messages%rowtype;
  v_full_name text;
begin
  if v_user_id is null or v_college_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if _class_id is null
     or _body is null
     or pg_catalog.char_length(pg_catalog.btrim(_body)) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Enter a message between 1 and 5000 characters.';
  end if;
  if not private.is_class_member(_class_id)
     or not exists (
       select 1
       from public.classes classroom
       where classroom.id = _class_id
         and classroom.college_id = v_college_id
         and classroom.is_active
     ) then
    raise exception using errcode = '42501', message = 'You cannot post in this class chat.';
  end if;
  if _parent_id is not null and not exists (
    select 1
    from public.class_messages parent
    where parent.id = _parent_id
      and parent.college_id = v_college_id
      and parent.class_id = _class_id
      and parent.deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'The reply target is unavailable.';
  end if;

  insert into public.class_messages (college_id, class_id, sender_id, body, parent_id)
  values (v_college_id, _class_id, v_user_id, pg_catalog.btrim(_body), _parent_id)
  returning * into v_message;

  select profile.full_name into v_full_name
  from public.profiles profile
  where profile.id = v_user_id
    and profile.college_id = v_college_id;

  return pg_catalog.jsonb_build_object(
    'id', v_message.id,
    'body', v_message.body,
    'sender_id', v_message.sender_id,
    'created_at', v_message.created_at,
    'edited_at', v_message.edited_at,
    'deleted_at', v_message.deleted_at,
    'parent_id', v_message.parent_id,
    'pinned_at', v_message.pinned_at,
    'attachment_name', v_message.attachment_name,
    'profiles', pg_catalog.jsonb_build_object('full_name', v_full_name)
  );
end
$$;

revoke all on function public.send_class_chat_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_class_chat_message(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
