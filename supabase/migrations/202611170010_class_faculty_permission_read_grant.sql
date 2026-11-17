-- Authenticated faculty need to read their own assignment permission row.
-- Existing class_faculty RLS policies continue to restrict visible rows.
grant select on public.class_faculty to authenticated;
