-- Grant the server-only timetable API the table privileges required for
-- faculty/admin timetable creation, listing and deletion. This does not
-- change Row Level Security or allow direct anonymous writes.
-- Apply after 202611180020/202611180022; safe to run more than once.

grant usage on schema public to service_role;
grant select, insert, delete on table public.class_schedule_entries to service_role;
