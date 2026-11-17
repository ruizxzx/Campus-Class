-- Server-side class invitation and enrollment routes read classes, rotate code hashes,
-- enroll students, and create their notifications.
grant usage on schema public to service_role;
grant select on table public.classes to service_role;
grant select, insert, update on table public.enrollment_codes to service_role;
grant insert on table public.class_enrollments to service_role;
grant insert on table public.notifications to service_role;
