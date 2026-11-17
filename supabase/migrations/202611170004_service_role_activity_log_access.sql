-- Server-side routes write audit records after privileged account and academic operations.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.activity_logs to service_role;
