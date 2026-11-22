-- Campus Class / 055 — durable, private library indexing queue and backfill
-- Forward-only. Apply manually in the Campus Class Supabase SQL Editor AFTER 054.
-- No existing learning material, file, chunk, or assessment is deleted.
begin;

create table if not exists public.study_material_index_jobs (
  version_id uuid primary key,
  college_id uuid not null,
  material_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','processing','retry','indexed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (college_id,material_id)
    references public.study_materials(college_id,id) on delete cascade,
  foreign key (college_id,version_id)
    references public.study_material_versions(college_id,id) on delete cascade
);

create index if not exists study_material_index_jobs_due_idx
  on public.study_material_index_jobs(status,next_attempt_at,created_at);

alter table public.study_material_index_jobs enable row level security;
revoke all on public.study_material_index_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.study_material_index_jobs to service_role;

-- Queue only the published CURRENT version. A restored historical version
-- gets queued if it lacks its own verified extracted text.
create or replace function public.queue_published_library_index()
returns trigger language plpgsql security invoker set search_path=''
as $body$
declare v_id uuid; v_mime text; v_indexed timestamptz;
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE'
     and old.status = 'published'
     and old.current_version = new.current_version then return new; end if;
  select v.id,v.mime_type,v.indexed_at into v_id,v_mime,v_indexed
    from public.study_material_versions v
    where v.college_id=new.college_id
      and v.material_id=new.id and v.version=new.current_version;
  if v_id is null or v_indexed is not null
     or v_mime not in ('application/pdf','text/plain') then return new; end if;
  insert into public.study_material_index_jobs(
    version_id,college_id,material_id,status,attempts,next_attempt_at,error_message
  ) values (v_id,new.college_id,new.id,'pending',0,now(),null)
  on conflict (version_id) do update set
    status='pending',attempts=0,next_attempt_at=now(),error_message=null,
    updated_at=now(),started_at=null,finished_at=null;
  return new;
end
$body$;

drop trigger if exists library_published_index_enqueue on public.study_materials;
create trigger library_published_index_enqueue
after update of status,current_version on public.study_materials
for each row execute function public.queue_published_library_index();

-- Synchronize direct faculty indexing as well as cron success, without
-- depending on the browser staying open after file upload.
create or replace function public.mark_library_index_completed()
returns trigger language plpgsql security invoker set search_path=''
as $body$
begin
  if new.indexed_at is not null and
     (old.indexed_at is distinct from new.indexed_at) then
    update public.study_material_index_jobs j
      set status='indexed',error_message=null,finished_at=now(),updated_at=now()
      where j.college_id=new.college_id and j.version_id=new.id;
  end if;
  return new;
end
$body$;
drop trigger if exists library_index_complete on public.study_material_versions;
create trigger library_index_complete
after update of indexed_at on public.study_material_versions
for each row execute function public.mark_library_index_completed();

-- Claim bounded batches atomically; prevent duplicate workers and recover
-- an interrupted worker after fifteen minutes.
create or replace function public.claim_study_material_index_jobs(p_limit integer default 3)
returns table (job_version_id uuid,job_college_id uuid,job_material_id uuid,job_attempts integer)
language plpgsql security invoker set search_path=''
as $body$
begin
  update public.study_material_index_jobs j
    set status='failed',
        error_message='Indexing worker interrupted repeatedly. Ask faculty to retry extraction.',
        updated_at=now(),finished_at=now()
    where j.status='processing'
      and j.started_at < now()-interval '15 minutes'
      and j.attempts >= 4;

  return query
    with candidate as (
      select j.version_id
      from public.study_material_index_jobs j
      join public.study_materials m
        on m.college_id=j.college_id and m.id=j.material_id
      join public.study_material_versions v
        on v.college_id=j.college_id and v.id=j.version_id
        and v.material_id=j.material_id
      where (j.status in ('pending','retry')
        or (j.status='processing'
          and j.started_at < now()-interval '15 minutes'))
        and j.attempts < 4 and j.next_attempt_at <= now()
        and m.status='published' and m.current_version=v.version
        and v.indexed_at is null
      order by j.next_attempt_at,j.created_at
      for update of j skip locked
      limit least(greatest(coalesce(p_limit,1),1),4)
    ), changed as (
      update public.study_material_index_jobs j
        set status='processing',attempts=j.attempts+1,
          started_at=now(),updated_at=now(),error_message=null
        from candidate c where c.version_id=j.version_id
        returning j.version_id,j.college_id,j.material_id,j.attempts
    )
    select c.version_id,c.college_id,c.material_id,c.attempts from changed c;
end
$body$;
revoke all on function public.claim_study_material_index_jobs(integer)
  from public,anon,authenticated;
grant execute on function public.claim_study_material_index_jobs(integer)
  to service_role;

-- Forward-only, idempotent backfill of previously published but unindexed
-- PDF/TXT resources. This queues work; the authorized worker extracts files.
insert into public.study_material_index_jobs(
  version_id,college_id,material_id,status,attempts,next_attempt_at
)
select v.id,m.college_id,m.id,'pending',0,now()
from public.study_materials m
join public.study_material_versions v
  on v.college_id=m.college_id and v.material_id=m.id
  and v.version=m.current_version
where m.status='published' and v.indexed_at is null
  and v.mime_type in ('application/pdf','text/plain')
on conflict (version_id) do nothing;

commit;
