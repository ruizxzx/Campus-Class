# Build 1.3 changelog

## Added

- Faculty Learning Studio for classroom stream, course and quiz authoring.
- Stream post publishing API with recipient targeting, private attachment storage, server-side file signature checks, and signed downloads.
- Stream filtering, pinned posts, discussion counts and paginated feed views.
- Course subject-enrollment visibility, curriculum navigation, lesson progress and supported video embeds.
- Multi-type quiz authoring, protected faculty grading/release RPC, and assessment/result notifications.
- Atomic quiz creation and publishing through a validated RPC, with class-assignment checks, server-side question validation, and no partial records when a save fails.
- Corrected the faculty quiz-attempt student-profile embed to use the explicit tenant-safe foreign-key relationship.
- Student classroom navigation links while preserving the existing My Classes workflow.
- Structural pgTAP assertions for targeted notifications, course enrollment visibility, attachment privacy and grading permissions.
- Reworked Class Chat into searchable section-based group rooms with unread summaries, realtime message/reaction updates, replies, emoji reactions, staff pins, message editing/deletion, history pagination and notification delivery.
- Added authenticated chat APIs, per-user read state, class-member authorization, MIME/signature/size-validated private attachments, expiring signed downloads and attachment cleanup on deletion.
- Added authenticated class-member RPCs for text messages and reaction toggles, plus explicit service-role permissions for attachment-backed message creation and cleanup.
- Preserved legacy classroom chat links by redirecting `/chat?class=<id>` to that section’s room.

## Learning Hub UI refinement

- Added consistent Learning Hub navigation and role-appropriate authoring shortcuts across stream, courses and assessments.
- Redesigned stream cards, class/type filters, course library cards, and quiz/exam schedule cards for clearer scanning on desktop and mobile.
- Reworked faculty post and course forms with labeled fields, recipient selection, attachment affordance, subject/chapter/lecture structure, and direct YouTube lesson links.
- Replaced the all-lessons video list with a chapter-based viewer that plays one supported embed at a time and reflects saved lecture completion.
- Added assessment-attempt progress and clearer question/schedule forms; added focus-visible and reduced-motion styling.

## Verification status

- `npm.cmd run typecheck`, focused ESLint on `components/class-chat-room.tsx`, and `git diff --check` passed after the chat-write fix.
- Playwright verified an authenticated chat reaction could be toggled and reverted. Text-message RPC execution is pending migration 019; the connected database returned `PGRST202` before that migration was applied.
- Production build did not complete: Turbopack failed on CSS processing, and the webpack fallback hit a sandbox `EPERM` while creating a `.next` output directory.
- The structural SQL test file contains 147 assertions, but database tests were not run. The local Supabase CLI could not write telemetry outside the workspace sandbox.
- No unit or E2E test files were found by the repository test-file search. Database behavior and tenant isolation are not certified by this change alone.
- The shared browser was available for authenticated admin-session route and interaction checks; separate faculty/student sessions and destructive actions were not tested.
- Class Chat has structural checks in the 155-assertion pgTAP file; database, multi-college RLS, storage upload/download, notification delivery and Realtime behavior remain unexecuted.

## Follow-up

Apply `202611180019_class_chat_authenticated_message_writes.sql` after the preceding Build 1.3 migrations before testing text-message posting and attachment writes. Realtime, scheduled stream publishing, stream edit/delete and topic management, full course authoring/material handling, quiz autosave/timer enforcement, negative marking and two-college behavioral tests remain incomplete.
