-- Durable college-scoped member provisioning queue. Apply after migration 050.
create table if not exists public.bulk_account_batches (
 id uuid primary key default gen_random_uuid(),
 college_id uuid not null references public.colleges(id) on delete cascade,
 created_by uuid not null,
 idempotency_key uuid not null,
 created_at timestamptz not null default now(),
 credentials_exported_at timestamptz,
 last_claimed_at timestamptz,
 unique (college_id,idempotency_key),
 unique (college_id,id),
 foreign key (college_id,created_by) references public.profiles(college_id,id)
);
create table if not exists public.bulk_account_rows (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null,
 college_id uuid not null,
 position integer not null check (position between 0 and 149),
 email text not null,
 full_name text not null,
 role text not null check (role in ('faculty','student')),
 department text,
 semester integer check (semester between 1 and 12),
 section text,
 identifier text,
 synthetic boolean not null default false,
 status text not null default 'pending' check (status in ('pending','processing','created','existing','failed')),
 reason text,
 auth_user_id uuid,
 attempts integer not null default 0,
 locked_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique (batch_id,position),
 unique (batch_id,email),
 foreign key (college_id,batch_id) references public.bulk_account_batches(college_id,id) on delete cascade
);
create index if not exists bulk_account_rows_work_idx on public.bulk_account_rows(status,locked_at,created_at);
alter table public.bulk_account_batches enable row level security;
alter table public.bulk_account_rows enable row level security;
drop policy if exists bulk_batches_admin_read on public.bulk_account_batches;
create policy bulk_batches_admin_read on public.bulk_account_batches for select to authenticated using (private.is_admin(college_id));
drop policy if exists bulk_rows_admin_read on public.bulk_account_rows;
create policy bulk_rows_admin_read on public.bulk_account_rows for select to authenticated using (private.is_admin(college_id));
grant select on public.bulk_account_batches, public.bulk_account_rows to authenticated;
grant select,insert,update,delete on public.bulk_account_batches, public.bulk_account_rows to service_role;
-- The service-role-only worker atomically leases work across concurrent invocations.
create or replace function public.claim_bulk_account_rows(p_limit integer default 8)
returns setof public.bulk_account_rows
language plpgsql security definer set search_path = ''
as $$
begin
 return query
 with claimed as (
  select r.id from public.bulk_account_rows r
  where (r.status = 'pending' and r.next_attempt_at <= now())
     or (r.status = 'processing' and r.locked_at < now() - interval '5 minutes')
  order by r.created_at,r.position
  for update skip locked
  limit least(greatest(p_limit,1),15)
 )
 update public.bulk_account_rows r set status='processing', locked_at=now(), attempts=r.attempts+1
 from claimed where r.id=claimed.id returning r.*;
end $$;
revoke all on function public.claim_bulk_account_rows(integer) from public, anon, authenticated;
grant execute on function public.claim_bulk_account_rows(integer) to service_role;

-- Admin-triggered short worker chunks support Vercel Hobby and resume after refresh.
-- The per-batch cooldown prevents simultaneous admin requests from multiplying Auth calls.
create or replace function public.claim_bulk_account_rows_for_batch(
 p_college_id uuid, p_batch_id uuid, p_limit integer default 8
) returns setof public.bulk_account_rows
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 update public.bulk_account_batches b set last_claimed_at=now()
 where b.id=p_batch_id and b.college_id=p_college_id
  and (b.last_claimed_at is null or b.last_claimed_at < now() - interval '4 seconds')
 returning b.id into v_id;
 if v_id is null then return; end if;
 return query
 with claimed as (
  select r.id from public.bulk_account_rows r
  where r.college_id=p_college_id and r.batch_id=p_batch_id and
  ((r.status='pending' and r.next_attempt_at <= now()) or (r.status='processing' and r.locked_at < now()-interval '5 minutes'))
  order by r.position for update skip locked limit least(greatest(p_limit,1),8)
 )
 update public.bulk_account_rows r
 set status='processing',locked_at=now(),attempts=r.attempts+1
 from claimed where r.id=claimed.id returning r.*;
end $$;
revoke all on function public.claim_bulk_account_rows_for_batch(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_bulk_account_rows_for_batch(uuid,uuid,integer) to service_role;
