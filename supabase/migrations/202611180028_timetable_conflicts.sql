-- CampusClass 2.0: database-level timetable collision protection.
-- Run manually AFTER 202611180027. Existing timetable rows are not deleted.
-- The trigger guards NEW inserts/updates, including concurrent requests.

begin;
create or replace function private.reject_timetable_conflicts()
returns trigger language plpgsql security invoker
set search_path = ''
as $$
begin
  if new.end_time <= new.start_time then
    raise exception using errcode='23514', message='End time must be after start time.';
  end if;
  -- Serialize changes for a college/week-day to prevent race conditions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.college_id::text || ':' || new.weekday::text, 0)
  );
  if exists (
    select 1
    from public.class_schedule_entries other
    where other.college_id=new.college_id
      and other.id <> new.id
      and other.weekday=new.weekday
      and other.start_time < new.end_time
      and other.end_time > new.start_time
      and (
        other.class_id=new.class_id
        or (
          new.location is not null and pg_catalog.btrim(new.location)<>''
          and other.location is not null and pg_catalog.btrim(other.location)<>''
          and pg_catalog.lower(pg_catalog.btrim(other.location)) =
              pg_catalog.lower(pg_catalog.btrim(new.location))
        )
        or exists (
          select 1 from public.class_faculty assigned_new
          join public.class_faculty assigned_other
            on assigned_other.college_id=assigned_new.college_id
           and assigned_other.faculty_id=assigned_new.faculty_id
          where assigned_new.college_id=new.college_id
            and assigned_new.class_id=new.class_id
            and assigned_other.class_id=other.class_id
        )
      )
  ) then
    raise exception using errcode='23P01',
      message='Timetable conflict: overlapping class, room, or assigned faculty time.';
  end if;
  return new;
end
$$;

drop trigger if exists campusclass_timetable_conflict_guard on public.class_schedule_entries;
create trigger campusclass_timetable_conflict_guard
before insert or update of college_id,class_id,weekday,start_time,end_time,location
on public.class_schedule_entries
for each row execute function private.reject_timetable_conflicts();

commit;
