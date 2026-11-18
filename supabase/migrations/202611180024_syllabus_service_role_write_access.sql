-- The syllabi API uses a dedicated server-side Supabase service-role client.
-- RLS BYPASS does not substitute for PostgreSQL table privileges when
-- automatic default grants are disabled. Keep these server-only grants minimal.
-- Re-runnable on upgraded projects. Never grant this access to anon.

grant usage on schema public to service_role;
grant select, insert, delete on table public.class_syllabi to service_role;
