# Faculty syllabus upload: metadata save failure

## Symptoms and root cause

The UI error `Could not save the syllabus.` means the PDF reached the `class-syllabi` Storage bucket, but the server's subsequent `public.class_syllabi` metadata insert failed. The API uses a server-only Supabase service-role client for this operation. Migrations 202611180020 and 202611180023 granted access to `authenticated` but omitted an explicit table grant to `service_role`. Projects with restrictive default privileges can return PostgreSQL error `42501` (`permission denied for table class_syllabi`). **This is a likely cause based on source; the actual Campus Class database error has not yet been observed.**

## Database fix

Apply `supabase/migrations/202611180024_syllabus_service_role_write_access.sql` to the **Campus Class** Supabase project, after the existing syllabus migrations. The patch is repeatable and grants only `SELECT`, `INSERT`, and `DELETE` on this table to `service_role`; it does not give `anon` or unrelated faculty new access and does not disable RLS.

```sql
grant usage on schema public to service_role;
grant select, insert, delete on table public.class_syllabi to service_role;
```

To check the privilege before/after migration, in SQL Editor run:

```sql
select has_table_privilege('service_role', 'public.class_syllabi', 'INSERT') as can_insert,
       has_table_privilege('service_role', 'public.class_syllabi', 'SELECT') as can_select,
       has_table_privilege('service_role', 'public.class_syllabi', 'DELETE') as can_delete;
```

If the table is missing, run the earlier syllabus migrations first. If insert still fails after grants, look in server logs for `Syllabus metadata insert failed` and the PostgreSQL error code; `23503` typically indicates a missing or mismatched college/class/profile foreign-key row. The API now surfaces the relevant category of error rather than only the generic message.

## Checks

Run `npm run test:security` after installing project dependencies. The `tests/syllabus-upload.node.mjs` suite checks assigned-faculty upload, missing-grant handling, foreign-key diagnostics, rejecting unassigned faculty, and missing table handling. These tests use mocked database responses; **they do not replace a staging end-to-end test**.

No live Supabase database was modified: the linked Supabase account does not expose a Campus Class project. Please apply the SQL specifically to that project, not to TABLELY or SELLORA.
