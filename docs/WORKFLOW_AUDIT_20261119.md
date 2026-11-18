# Campus Class workflow audit — 19 November 2026

## Review scope
Reviewed source, route configuration, existing security tests and migration history on the GitHub main branch. This is an engineering review and regression-hardening record, **not a claim of zero bugs or live tenant-certified production readiness**.

| Ecosystem | Entry points / code | Main contract checked | Remaining live test |
|---|---|---|---|
| College admin and role security | app/(app)/admin, lib/http.ts, lib/auth.ts | Authenticated college-scoped role gates | Two-college membership isolation |
| Registration/invitations | app/(auth), app/api/invitations | Single-use claim, account ownership, recovery on profile error | Invite activation and retries |
| Class joining and leaving | app/api/classes, components/leave-class-button.tsx | Active class code; leave vs administrator removal | Valid and revoked codes |
| Faculty stream publishing | app/api/stream/posts/route.ts | Faculty/class membership, post then attachments then publication | Uploads, selected recipients, permissions |
| Class chat | app/api/chat, components/class-chat-room.tsx | Class membership and owner/moderator controls | Multi-user Realtime behavior |
| Assignments and projects | app/api/assignments, components/academic-workflows.tsx | Assigned faculty; publish only after files saved | Faculty publish/edit/archive with files |
| Student work | app/api/submissions, components/academic-workflows.tsx | Active enrollment, deadlines, grading locks, attachment ownership | Concurrent submissions and re-submissions |
| Marks and feedback | app/api/submissions/[id]/evaluate | Max marks, faculty access, release state and notifications | Unreleased/released marks across accounts |
| Quizzes | app/api/quizzes, components/quiz-runner.tsx | Authenticated attempt sessions, server-side expiration | Concurrent tabs and timed attempts |
| Attendance | app/api/attendance | Session token, expiring QR, staff permissions | Correct vs absent vs expired check-in |
| Courses and syllabus | app/(app)/courses, app/api/syllabi | Class-scoped resources and private files | Protected downloads and PDF processing |
| AI features | app/api/ai, app/api/admin/ai-settings | Context authorization, model quota, server-only keys | Live OpenRouter model + pgvector retrieval |
| Analytics and outcomes | app/api/outcomes, app/(app)/gradebook, app/(app)/success | College and faculty scope | Live data integrity and migrations 026-037 |
| Student-success interventions | app/api/success/interventions | Assigned-class authorization and action validation | Intervention follow-up lifecycle |
| Schedules | app/api/schedules | Class assignment and conflict validation | Timezone and overlapping sessions |
| Notification inbox | app/api/assignments/[id]/notify, app/api/announcements/[id]/notify | Reference-key dedup and paged rosters | Actual in-app delivery |
| Deadline reminders | app/api/cron/deadline-reminders | Authenticated cron, paged assignments/rosters/submissions, idempotent notices | Scheduled Vercel invocation |
| Certificates and course completion | app/(app)/certificates, components/lesson-complete-button.tsx | Existing UI and permissions | PDF issuing/revocation remains separate work |

## Fixes in this audit
1. Paginate reminder cron's assignments, submission history and enrollment rosters, rather than relying on the PostgREST max-row default.
2. Prevent reusing an existing submission Storage object; never delete an object when a completed API POST might still reference it.
3. Preserve existing released grade visibility during private edits, retry grade/status synchronization and make release notifications idempotent.
4. Unclaim an invitation on profile activation failure using the exact claim timestamp.
5. Distinguish voluntarily left class re-enrollment from administrator removal, validate database errors.
6. Add forward-only SQL 039: scoped service-role enrollment restore grant; conditionally enforce unique private attachment ownership without deleting duplicate legacy rows.
7. Safeguard enrollment-code rotation so an insert failure does not invalidate the previous code.
8. Require PDF filenames for syllabus uploads, distinguish database lookup errors from missing records and let staff retry announcement notifications without moving published announcements between classes.

## Operational prerequisites
- Apply migrations through **039** in order in the correct Campus Class production Supabase SQL Editor. The GitHub push does not run database migrations.
- For SQL 039, inspect its read-only duplicate query and check that its unique index exists; when duplicates are found the patch intentionally preserves them and skips the index.
- Re-save the college OpenRouter key if required by SQL 032; verify the live pgvector extension and RAG pipeline before describing them as fully functional.
- Run authenticated end-to-end checks with two colleges, multiple roles, and actual private Storage objects.
- Confirm Vercel production deploys the final commit and inspect runtime permission errors.

## Verification limitations
CI runs Node security tests, TypeScript checks, ESLint, Next.js production builds and **anonymous** Chromium smoke tests. These checks cannot prove Supabase production RLS, migrations, cross-college isolation, active credentials, email delivery, browser-only uploads or absence of all bugs. No unrelated Supabase projects are modified during this audit.
