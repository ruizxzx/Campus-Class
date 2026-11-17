-- Server-side assignment deletion and submission editing use the service-role client.
grant usage on schema public to service_role;
grant delete on table public.assignments to service_role;
grant select on table public.assignment_attachments to service_role;
grant select, update on table public.assignment_submissions to service_role;
grant select on table public.assignment_evaluations, public.submission_attachments to service_role;
