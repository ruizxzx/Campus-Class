# Smart YouTube Playlist-to-Course Importer — Campus Class 2.0

## Operator SQL and deployment steps
After existing migrations **001–044**, execute the following new forward-only files in the **actual Campus Class Supabase SQL Editor** in order:

1. `supabase/migrations/202611190045_youtube_playlists_schema.sql` — tenant-safe job queue, playlist and lesson references, watch evidence, academic requirements, RLS, indexes.
2. `supabase/migrations/202611190046_youtube_import_atomic_functions.sql` — atomic claim and apply functions, durable checkpoints, idempotent duplicate handling, no destructive re-sync.
3. `supabase/migrations/202611190047_youtube_watch_certificates.sql` — server-timed watch ranges and optional quiz/assignment/faculty approval certificate gates.
4. `supabase/migrations/202611190048_youtube_course_publish_service_grants.sql` — restore explicit `service_role` course insert/update privileges required by security-invoker SQL 046. This fixes the permission failure (42501) observed when playlist fetching works but course publishing fails.

If you already applied SQL 045–047, **run only SQL 048**, then reopen your saved review job and click Publish complete course again. The previous database transaction rolled back when apply failed; the playlist metadata remains available. SQL 048 does not replace or edit historical migrations. If the error persists, check the latest Vercel log reason code; role or target-course authorization mismatch errors require checking the staff assignment rather than expanding database access.

These migrations DO NOT run automatically during GitHub deployment. Back up the production database, run staging tests with two colleges, then run the SQL in production.

Set `YOUTUBE_DATA_API_KEY` as a **server-only** Vercel environment variable (Google Cloud → enable **YouTube Data API v3**, create API key, restrict it to the API and to trusted server egress where practical). Never use `NEXT_PUBLIC_` for this key. Confirm `CRON_SECRET` is configured for the daily worker. Existing Supabase credentials and the college OpenRouter key are still required.

## Main experience

- Faculty → Learning studio → Course → **Import YouTube playlists**. Paste 1–5 YouTube playlist URLs, choose assigned college subject and new/existing course, fetch via YouTube Data API v3; job checkpoints survive refresh. Review statuses; select/deselect; rename, move and regroup lectures; AI suggestions use ONLY titles/descriptions, never scraped transcripts. Save edit selections, create draft or publish.
- Playlist import creates actual `courses`, `course_modules`, `course_lessons` and `youtube_lesson_sources` records in one transactional stored procedure (SQL 046). Duplicate videos in the target course are skipped.
- Learner → Course → imported video uses official YouTube IFrame API, authenticated session, resumable playback, and server-timed interval-coverage tracking. Configurable watched threshold is 60–100% (default 90%). Seeking forward does not earn the skipped portion. The server still cannot establish human attention or defend against a completely compromised browser; institutions should configure academic assessment requirements for high-stakes credentials.
- Existing `lesson_progress` and college-branded `academic_certificates` are reused. Student's certificate is issued only when ALL published lessons and optional quiz, assignment and faculty approval gates are satisfied. Later release of an assessment rechecks pending awards.
- Faculty progress report includes per-lecture completion, last YouTube activity, watch metrics, approved students and certificate status.
- Playlist synchronization is REVIEW-first: changes are fetched and compared with stored lesson references. Removed videos are marked but lessons, completion and issued certificates are not deleted. Auto-addition needs explicit setting by faculty.
- A daily Vercel Cron job at `/api/cron/youtube-imports` resumes queued jobs, scans linked playlists, and removes stale imported YouTube metadata after 30 days. With daily scheduling, unattended very large playlists may require multiple cron cycles; while the wizard is open each serverless request processes one 50-video page until finished.
- Each atomic apply supports up to **1,200 lectures** in one payload and up to 80 chapters. Larger playlists require splitting into manageable courses/batches to avoid serverless timeouts. Data API job checkpointing itself remains paginated.

## Security checklist

- `YOUTUBE_DATA_API_KEY` server-only; whitelist YouTube hosts and accept only playlist IDs, never arbitrary URL fetches.
- Service-role API calls authenticate the user, enforce college and assigned subject; students cannot import or edit jobs.
- RLS allows only job-owning faculty/admin to read drafts; learner watch progress SELECT is owner-scoped; all job and watch mutations are restricted to service_role.
- SQL 047 double-checks subject enrollment and uses server clock deltas and distinct int4multirange coverage to prevent obvious seek-to-end completion credit.
- Cron uses the existing constant-time bearer secret check; queue claims use PostgreSQL row locks.
- No student progress, playlist-origin lessons or certificates are silently deleted during synchronization.

## Validation limitations

Run CI (security tests, TypeScript, ESLint, Next.js build and anonymous Chromium tests), then live end-to-end with real YouTube API key and Supabase migrations. A YouTube API key is required for live metadata requests; AI models require an enabled college OpenRouter account. YouTube content, embeddability and quota can change. Do not call this deployment fully production-certified until authenticated, cross-college RLS tests and an actual watch→certificate flow pass.

Manual acceptance matrix: faculty A assigned/unauthorized subjects; student A enrolled/not enrolled; second college B; private/unembeddable/duplicate videos; 50+/150+ video playlists; refresh during import; source change/reorder/removal; quota exhaustion; seek to near end; resume two devices; completion threshold; quiz/assignment gates; certificate idempotency.
