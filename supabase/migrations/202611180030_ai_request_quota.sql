-- CampusClass 2.0 forward-only hourly AI budget guard.
-- Apply manually AFTER 202611180029. A user is allowed at most 30 AI calls
-- per UTC hour (server-side, across all routes/instances).

begin;
create table if not exists public.ai_request_usage (
  college_id uuid not null,
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count between 1 and 30),
  primary key (college_id,user_id,window_start),
  foreign key (college_id,user_id) references public.profiles(college_id,id) on delete cascade
);
alter table public.ai_request_usage enable row level security;
revoke all on public.ai_request_usage from public,anon,authenticated;
grant select,insert,update,delete on public.ai_request_usage to service_role;

create or replace function public.consume_ai_request_quota(
  p_college_id uuid, p_user_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_window timestamptz := date_trunc('hour',pg_catalog.clock_timestamp());
begin
  if p_college_id is null or p_user_id is null then
    return false;
  end if;
  -- Refuse suspended/moved profiles even when a stale server session exists.
  if not exists (
    select 1 from public.profiles p
    where p.id=p_user_id and p.college_id=p_college_id and p.status='active'
  ) then
    return false;
  end if;
  insert into public.ai_request_usage (college_id,user_id,window_start,request_count)
  values (p_college_id,p_user_id,v_window,1)
  on conflict (college_id,user_id,window_start) do update
    set request_count = public.ai_request_usage.request_count + 1
    where public.ai_request_usage.request_count < 30
  returning request_count into v_count;
  return v_count is not null;
end
$$;

revoke all on function public.consume_ai_request_quota(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_ai_request_quota(uuid,uuid) to service_role;
commit;

-- Optional maintenance after reviewing rows older than 90 days:
-- delete from public.ai_request_usage where window_start < now() - interval '90 days';
