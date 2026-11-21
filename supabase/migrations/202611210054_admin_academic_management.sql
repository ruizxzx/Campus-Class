-- Forward only: new management tables and restricted server operations.
-- Does not backfill, delete or rewrite any existing demo records.
begin;
alter table public.profiles add column if not exists department_id uuid;
do $$ begin
 if not exists (select 1 from pg_constraint where conname='profiles_college_department_fk' and conrelid='public.profiles'::regclass) then
   alter table public.profiles add constraint profiles_college_department_fk foreign key (college_id,department_id) references public.departments(college_id,id);
 end if;
end $$;
create table if not exists public.academic_semesters (
 college_id uuid not null references public.colleges(id) on delete cascade,
 academic_year text not null check(length(academic_year) between 4 and 25),
 semester integer not null check(semester between 1 and 12),
 created_at timestamptz not null default now(),
 primary key(college_id,academic_year,semester)
);
create table if not exists public.college_certificate_branding (
 college_id uuid primary key references public.colleges(id) on delete cascade,
 template text not null default 'classic' check(template in ('classic','modern')),
 logo_data text check(logo_data is null or length(logo_data)<=350000 and logo_data ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')
);
create table if not exists public.college_ai_daily_usage (
 college_id uuid not null references public.colleges(id) on delete cascade,
 day date not null,
 mode text not null check(mode in ('chat','practice','revision','summary','resource','evaluation')),
 requests bigint not null default 1 check(requests>0),
 primary key(college_id,day,mode)
);
alter table public.academic_semesters enable row level security;
alter table public.college_certificate_branding enable row level security;
alter table public.college_ai_daily_usage enable row level security;
revoke all on public.academic_semesters,public.college_certificate_branding,public.college_ai_daily_usage from public,anon,authenticated;
grant select,insert on public.academic_semesters to service_role;
grant select,insert,update on public.college_certificate_branding to service_role;
grant select,insert,update on public.college_ai_daily_usage to service_role;
grant select on public.departments to service_role;
grant update (revoked_at) on public.academic_certificates to service_role;
create or replace function public.record_college_ai_request(p_college uuid,p_mode text)
returns void language sql security invoker set search_path='' as $$
 insert into public.college_ai_daily_usage(college_id,day,mode) values(p_college,(now() at time zone 'Asia/Kolkata')::date,p_mode)
 on conflict(college_id,day,mode) do update set requests=public.college_ai_daily_usage.requests+1;
$$;
revoke all on function public.record_college_ai_request(uuid,text) from public,anon,authenticated;
grant execute on function public.record_college_ai_request(uuid,text) to service_role;
create or replace function public.admin_update_member(p_college uuid,p_actor uuid,p_member uuid,p_role text,p_department uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare old_role text;
begin
 if not exists(select 1 from public.profiles where college_id=p_college and id=p_actor and role='admin' and status='active') then raise exception using errcode='42501',message='Admin required';end if;
 select role into old_role from public.profiles where college_id=p_college and id=p_member and role in ('faculty','student') for update;
 if not found or p_role not in ('faculty','student') then raise exception using errcode='42501',message='Only faculty/student members may be edited';end if;
 if p_department is not null and not exists(select 1 from public.departments where college_id=p_college and id=p_department and is_active) then raise exception using errcode='22023',message='Choose an active department in this college';end if;
 if old_role<>p_role and (exists(select 1 from public.class_faculty where college_id=p_college and faculty_id=p_member) or exists(select 1 from public.class_enrollments where college_id=p_college and student_id=p_member and status='active')) then
 raise exception using errcode='22023',message='Resolve active class memberships before changing this role';end if;
 update public.profiles set role=p_role,department_id=p_department where college_id=p_college and id=p_member;
end;
$$;
revoke all on function public.admin_update_member(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_member(uuid,uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
