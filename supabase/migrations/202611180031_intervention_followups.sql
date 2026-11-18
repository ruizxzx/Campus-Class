-- CampusClass 2.0 faculty intervention plans and outcome tracking.
-- Apply manually AFTER 202611180030; adds nullable fields without rewriting
-- or deleting historic notes, statuses or student records.
begin;
alter table public.student_interventions
  add column if not exists action_plan text
    check (action_plan is null or char_length(action_plan) <= 3000),
  add column if not exists follow_up_at date,
  add column if not exists outcome_note text
    check (outcome_note is null or char_length(outcome_note) <= 3000),
  add column if not exists resolved_at timestamptz;
create index if not exists student_interventions_due_idx
  on public.student_interventions(college_id,follow_up_at)
  where status <> 'resolved' and follow_up_at is not null;
-- Existing staff-only RLS and same-college foreign keys remain unchanged.
commit;
