# CampusClass Build 1.3

## Implemented

- Added a faculty Learning Studio at `/faculty/learning` for publishing class stream posts, courses with a first module/lesson, and multiple-choice assessments.
- Preserved the existing My Classes routes and added the studio to faculty navigation.
- Added server-enforced stream activity notifications for enrolled students and post authors through a new ordered migration.
- Reused existing RLS, college-scoped relationships, quiz submission RPC, course lesson progress, comments, and notification tables.

## Verification

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

The Supabase migration and RLS suite still requires a running local Supabase stack (`supabase db reset && supabase test db`).

## Remaining hardening

Realtime subscriptions, stream attachment upload UI, scheduled publishing, multi-question quiz authoring, manual grading/release controls, and full two-college integration coverage remain follow-up work. They must not be represented as complete until exercised against PostgreSQL fixtures.
