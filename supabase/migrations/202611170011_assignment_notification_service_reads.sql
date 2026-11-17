-- Assignment notification delivery uses the server-only service-role client.
grant usage on schema public to service_role;
grant select on table public.assignments, public.class_faculty, public.class_enrollments to service_role;
