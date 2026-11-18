# CampusClass deployment checklist

## Before first deployment

- [ ] Create a Supabase project in the region closest to the college users.
- [ ] Copy the project URL, publishable key, and server-only secret key into the deployment environment.
- [ ] Keep the secret key in `SUPABASE_SERVICE_ROLE_KEY`; never prefix it with `NEXT_PUBLIC_`.
- [ ] Apply `supabase/migrations/202611170001_campusclass_core.sql` using the Supabase CLI.
- [ ] Configure Auth site URL and redirect allow-list for localhost, production, and the required Vercel preview URLs.
- [ ] Configure production SMTP and keep email confirmation enabled.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the production origin.
- [ ] Set a strong `CRON_SECRET` matching the Vercel Cron Authorization header.
- [ ] Run `supabase test db` and Supabase security advisors.
- [ ] Install dependencies and run `npm run typecheck`, `npm run lint`, and `npm run build` locally or in CI.

## Required acceptance tests

- [ ] Register two separate colleges and verify their administrators see only their own data.
- [ ] Invite faculty and students to each college and complete email confirmation.
- [ ] Assign faculty to a class and explicitly grant assignment management only to staff who should create/edit/grade work.
- [ ] Join a student using a valid code; verify invalid, expired, disabled, duplicate, and cross-college codes are rejected.
- [ ] Publish an assignment, submit text and files, and verify server timestamps and late/resubmission rules.
- [ ] Evaluate a submission privately, verify the student cannot see it, then release and verify marks/feedback appear.
- [ ] Verify students cannot read other students' submission rows or private files.
- [ ] Verify faculty cannot grade classes without `can_manage_assignments` permission.
- [ ] Verify deactivated accounts lose access to protected pages and API routes.
- [ ] Verify Vercel Cron creates one deadline reminder per student and assignment.

## GitHub and Vercel

Create a new empty GitHub repository and push the project using the commands in `README.md`. Import that repository into Vercel, set the environment variables for Preview and Production, then deploy. Do not add `.env.local` to Git.


## CampusClass 1.1 expanded module checks

- [ ] Apply `202611170002_learning_collaboration.sql` after the core migration in a disposable Supabase project.
- [ ] Apply Build 1.3 migrations `202611180015_build_13_activity_notifications.sql`, `202611180016_build_13_learning_workflows.sql`, and `202611180017_quiz_authoring_rpc.sql` in timestamp order.
- [ ] Apply `202611180018_class_chat_groups.sql` after the existing Build 1.3 migrations.
- [ ] Validate RLS for posts, stream targets, private comments, chat, notes, to-do, quizzes, courses, progress, achievements and certificates using admin/faculty/student test users from two colleges.
- [ ] Verify targeted stream notifications, attachment signed URLs, and storage denial for non-recipients and unrelated colleges.
- [ ] Verify objective auto-grading, short-answer grading, and result release against student/faculty/admin roles in two colleges.
- [ ] Verify assigned faculty can atomically create and publish a quiz with questions; verify unassigned faculty, students, inactive users and cross-college class IDs are rejected.
- [ ] Verify Class Chat lists only active class sections the current admin/faculty/student can access and that legacy `/chat?class=<id>` links open the intended room.
- [ ] Verify section members can post, reply, react, edit their own messages, mark rooms read and receive one notification per new message; verify only assigned faculty/admin can pin or moderate other users' messages.
- [ ] Verify chat attachments reject unsupported MIME/signatures and oversize files, use private storage and expiring downloads, and cannot be fetched from another section or college.
- [ ] Verify Realtime message and reaction updates for enrolled students and assigned faculty, including membership removal and inactive class behavior.
- [ ] Prevent student clients from selecting quiz answer keys; confirm server-side grading and release functions before enabling assessments.
- [ ] Add a certificate verification endpoint that returns only minimum non-sensitive fields by certificate number.
- [ ] Configure scheduled publication and realtime subscriptions before marketing those capabilities as live.
- [ ] Test chat/stream/comment abuse limits and upload access controls.
