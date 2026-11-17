-- Assignment submissions and their file metadata are created by trusted server routes.
grant usage on schema public to service_role;
grant insert, delete on table public.assignment_submissions to service_role;
grant insert on table public.submission_attachments to service_role;
