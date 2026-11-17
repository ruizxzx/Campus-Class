# CampusClass Build 1.1 — merge notes

## References reviewed
- ScholaFlow source ZIP uploaded in this conversation (MIT license): README and source inventory reviewed.
- LMS Front repository README and repository metadata: https://github.com/guillermoscript/lms-front (MIT license).

## Added in this build
- Expanded class activity stream (class posts, topics, targeted student rows, attachments metadata, comments).
- Per-class messaging schema and chat UI.
- Personal notes UI and database table.
- Student to-do aggregation view.
- College-owned courses, course modules, lesson content and lesson completion.
- Quiz and exam database model (quizzes, question type/options/answer-key fields, attempts).
- Student learning statistics, achievements, certificates data model.
- Results/feedback and certificate listing views.
- Academic calendar view.
- Selected ScholaFlow visual reference assets stored under `reference-assets/scholaflow/`.
- College-specific navigation and feature documentation.

## Security changes in the second migration
- All new tables enable RLS.
- Class-scoped access delegates to the existing CampusClass `private.can_access_class` / `private.is_faculty_in_class` / `private.is_admin` helpers.
- The college-scoped faculty helper is defined before policies that call it.
- Targeted stream post, attachment and comment reads share the same visibility check.
- Students have no direct write privileges on learning statistics or quiz attempts. Quiz submissions use `public.submit_quiz_attempt`; the function validates membership, availability and attempt limits, and does not accept score or release fields.
- Learning-stat visibility for faculty is limited to students in their assigned classes.
- Personal notes and to-do items are owner-only.
- No anonymous certificate listing policy.
- The quiz-question table does not grant the `answer_key` column to authenticated clients.

## Current delivery limitations
This is a merge build, not a production certification. The SQL migrations have not been executed against PostgreSQL. The npm dependency installation attempt timed out before producing a lockfile or allowing a Next.js production build. No live Supabase test project or two-college account set was available.

The following reference capabilities are modelled or partially surfaced but are not complete, and must not be marketed as live until implemented and tested:
- Quiz authoring, timed attempt UI, server-side grading, grade release and anti-cheating controls.
- Rich-text editor interface for stream posts, lessons and notes.
- Supabase Realtime subscriptions and moderation/rate limiting for class chat/stream.
- Scheduled stream publisher worker.
- Certificate verification endpoint, PDF rendering and revocation controls.
- XP awarding triggers, streak calculations, achievement criteria and leaderboards.
- AI tutor/MCP service and institution-scoped retrieval.
- Full locale/i18n translation bundles.
- Comprehensive end-to-end RLS tests for added tables.

## Before production
1. Run `npm install`, then commit the generated `package-lock.json`.
2. Run `npm run typecheck`, `npm run lint`, `npm run build`.
3. Apply migrations and run `supabase test db` against a clean staging Supabase project.
4. Test admin/faculty/student access with two colleges, including attempts to read across college boundaries.
5. Add server-side quiz grading and private answer key storage before enabling exams.
6. Add end-to-end tests for private comments, targeted stream visibility, chat membership, course lessons, achievement awards and certificate verification.
