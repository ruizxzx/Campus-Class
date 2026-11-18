# Mobile navigation and timetable reliability — November 2026

## Mobile changes

- Desktop sidebar navigation scrolls independently of the profile/header and appearance/sign-out controls, including on shorter screens.
- Mobile sidebar has a touch-scrollable, `min-height:0` navigation region, safe-area aware footer and visible Close control; it locks background scrolling, traps keyboard focus, supports Escape, and closes at desktop breakpoint.
- Mobile bottom quick links and desktop sidebar now switch at the same 768px breakpoint (previously 800px CSS contradicted Tailwind `md`).
- Consistent small-screen spacing, scrollable tables, text wrapping, touch-sized navigation, and less overflow-prone page cards/forms across admin, faculty and student workspaces.
- Header install action collapses to an icon on narrow screens; course planning and class chat interfaces no longer rely on wide minimum columns.

## Timetable API

The server-side `POST /api/schedules` uses `service_role` to insert a new row into `public.class_schedule_entries`. Prior migrations (`202611180020`/`202611180022`) granted table privileges to `authenticated`, but did **not explicitly grant the server-side `service_role` access**. On projects without default grants, insert can fail with `42501`, giving the generic "Could not save the timetable entry." error. This is a *source-derived likely cause*, not a confirmed diagnosis from live DB logs.

Run `supabase/migrations/202611180025_timetable_service_role_access.sql` in **the Campus Class project** SQL Editor, after existing academic planning migrations. The script is idempotent:

```sql
grant usage on schema public to service_role;
grant select, insert, delete on table public.class_schedule_entries to service_role;
```

If the table does not exist, apply the earlier academic planning migrations first; the grant alone cannot create it. No RLS policy, anonymous grants, or existing timetable records change.

The API now returns distinct messages for missing grants, a missing table, duplicate slots, and invalid college/class/profile references, with safer diagnostics for verification queries and deletions.

**Validate in Supabase SQL Editor** (after verifying the table exists):

```sql
select
  has_table_privilege('service_role', 'public.class_schedule_entries', 'SELECT') as can_select,
  has_table_privilege('service_role', 'public.class_schedule_entries', 'INSERT') as can_insert,
  has_table_privilege('service_role', 'public.class_schedule_entries', 'DELETE') as can_delete;
```

**Deployment:** This change must be deployed in the Next.js hosting environment to pick up the UI/API fixes. Do not apply the SQL to unrelated Supabase projects. No live database was modified.
