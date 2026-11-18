# CampusClass Build 1.3

## Implemented in this change

- Added a faculty learning studio without replacing My Classes.
- Added authenticated class-stream publishing with class-wide or selected-student visibility, pinning and one validated file attachment. Attachments are stored in a private bucket and served through short-lived signed URLs after parent-post authorization.
- Added stream filters, pinned-post display, comment counts, discussion views and paging. RLS continues to govern post, target, attachment and comment visibility.
- Added notification triggers for stream activity, published assessments and released assessment results. Targeted-post notifications are limited to the intended recipients.
- Limited student course discovery to active courses for subjects represented by an active class enrollment. Course detail now shows published lessons, a curriculum list, progress, continue-learning navigation and supported YouTube/Vimeo embeds.
- Added multi-question quiz authoring for multiple-choice, multiple-select, true/false and short-answer items, along with draft/publish state, schedule, duration and attempt settings.
- Quiz authoring now submits through an authenticated, database-validated RPC that creates the assessment, its questions and its publish state atomically; the API returns actionable validation/permission errors without leaving partial quiz rows.
- Fixed faculty attempt loading to embed student profiles through the explicit college-scoped quiz-attempt foreign key, preserving staff access to submissions.
- Added a faculty-only database grading RPC for short-answer marks, automatic objective scoring, feedback persistence and result release.
- Added classroom navigation links for the existing student class detail page and query filters for stream, assignments, courses and quizzes.
- Expanded Class Chat into one private group room per active class section, with a searchable room list, recent-message previews, unread counts, realtime updates, replies, reactions, staff pins, pagination, message editing/deletion and in-app notifications.
- Added server-validated chat attachments with MIME/signature/size checks, private storage, short-lived authorized downloads and cleanup when a message with an attachment is deleted.
- Added per-user chat read state and class-scoped authorization for room access, posting, moderation, reactions, pins and attachment delivery. Existing class-specific `/chat?class=...` links now open the matching section room.
- Routed text messages and reactions through authenticated, class-membership-checked database RPCs; added explicit service-role permissions for attachment-backed messages and cleanup.
- Refreshed the Learning Hub stream, course library, course player, assessment library and quiz-taking surfaces with consistent subject/class context, responsive cards, filters and clearer publishing forms.
- Added a chapter-and-lecture course player that embeds one allow-listed YouTube/Vimeo lesson at a time, saves lecture completion, and shows per-chapter and course progress.
- Faculty Learning Studio shortcuts now open the selected post, course or assessment form directly. Assessment creation shows question counts and total marks.

## Known incomplete work

- Stream editing/deletion, topic authoring, scheduled publication, realtime updates, and reply/comment moderation are not implemented.
- Class Chat does not support user-created/cross-section groups, typing/presence indicators, voice/video calls, or abuse/rate-limit controls. Its tenant, role, Realtime and attachment behavior still requires live two-college integration testing.
- Course authoring still creates one module and one lesson per course. Reordering, lesson editing/unpublishing, course-material uploads, rich text, a learning-history view and dashboard-level continue-learning are incomplete.
- Quiz attempts are submitted in one operation. Durable autosave/resume, server-enforced duration from a start timestamp, negative marking, per-attempt timer handling, and a private answer-key store for high-stakes exams are incomplete.
- The new SQL checks are structural only. Two-college RLS/storage fixtures and end-to-end notification, upload/download, grading and release tests have not run.
- Apply migrations `202611180015_build_13_activity_notifications.sql` through `202611180019_class_chat_authenticated_message_writes.sql` in timestamp order before exercising the new workflows.

## Verification

- `npm.cmd run typecheck`: passed after the chat-write fix.
- Focused ESLint on `components/class-chat-room.tsx`: passed.
- Playwright in the shared authenticated admin session verified a reaction could be toggled and reverted through the authenticated RPC without a failed API request. A text-send attempt reported `PGRST202` because migration 019 is not yet applied to the connected database.
- `git diff --check`: passed after the chat additions (Git emitted only existing LF-to-CRLF working-copy warnings).
- `npm.cmd run build`: blocked. Turbopack failed while processing CSS; the webpack fallback was denied creating `.next/server/app/(app)/faculty/assignments` (`EPERM`) by the sandbox.
- The SQL test file contains 155 structural pgTAP assertions, including chat write RPC and service-role permissions. `supabase test db` was not run; database and tenant-isolation behavior remain unverified.
- No unit/E2E test files matched the repository test-file search. Browser interaction coverage used an existing admin account; separate faculty/student sessions and destructive workflows were not tested.
- The shared browser preview is available, but Realtime connectivity was intermittent. Production build and live migration/RLS/storage tests remain unverified.

Build 1.3 is not production-certified until the migrations are applied and the tenant/role, private-storage, attempt-grading and release test matrix passes.
