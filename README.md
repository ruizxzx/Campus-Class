# CampusClass

CampusClass is a multi-tenant college academic workspace built with Next.js App Router, TypeScript, Tailwind CSS and Supabase. It provides separate administrator, faculty and student experiences with a shared academic data model.

## Included in this repository

- Public product landing page and college administrator onboarding.
- Supabase Auth with cookie-based server-side sessions and password recovery.
- Administrator-created faculty/student accounts with temporary passwords; no invitation email is sent.
- College, department, subject, class, faculty assignment and student enrollment workflows.
- Server-validated enrollment code generation and class joining.
- Assignment drafts and publishing, private reference materials, student submissions and version history.
- Faculty evaluation with a separate release-controlled evaluation table so unreleased marks/feedback are not visible to students.
- Class announcements, personal notifications (including daily deadline reminders), profile settings and academic reports.
- PostgreSQL composite foreign keys, indexes, private helper functions, RLS policies and private Storage buckets.
- Vercel-ready Next.js configuration and environment variable template.

## Prerequisites

- Node.js 20.9 or newer (Node 22 recommended).
- npm 10 or newer.
- A Supabase project with Auth, PostgreSQL and Storage enabled.
- A Vercel account for hosting.

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Commit the generated `package-lock.json` before the first GitHub push so local, CI and Vercel dependency installs use the same resolved versions. The source bundle does not include a lockfile because dependency installation could not complete in its build environment.

Fill in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=use_a_long_random_secret
```

`SUPABASE_SERVICE_ROLE_KEY` is a server-only secret. Do not prefix it with `NEXT_PUBLIC_`, commit it, paste it into client-side code, or expose it in browser tools. The project specification uses this environment variable name; a current Supabase secret key or compatible service-role key can be stored there.

## 2. Apply the Supabase migration

Install/use the Supabase CLI, authenticate and link this local project to your hosted project:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --remote
```

Supabase CLI v3 is local-first. The `--remote` flag is intentional when applying migrations to the linked hosted project. Review the SQL migration before applying it to production.

Apply all migrations in timestamp order. In addition to the core schema:

- `supabase/migrations/202611170001_campusclass_core.sql` creates the core schema, policies, and private Storage buckets.
- `supabase/migrations/202611170002_learning_collaboration.sql` adds the learning and collaboration tables.
- `supabase/migrations/202611170003_service_role_profile_access.sql` grants the server-only `service_role` the profile-table permissions used to provision faculty and student accounts.
- `supabase/migrations/202611170004_service_role_activity_log_access.sql` grants the server-only `service_role` the activity-log permissions used by privileged routes.
- `supabase/migrations/202611170005_service_role_enrollment_code_access.sql` grants the server-only `service_role` the class/code/enrollment permissions used to create invites and join classes.
- `supabase/migrations/202611170006_assignment_management_rls.sql` re-scopes faculty assignment-management checks to the current college and refreshes assignment write policies.
- `supabase/migrations/202611170007_learning_collaboration_hardening.sql` hardens collaboration, quiz, course, lesson-progress, achievement, and certificate permissions; validates and grades quiz answers; tracks daily learning streaks; and adds a score-safe attempt-summary RPC.
- `supabase/migrations/202611170008_assignment_publishing_rls_repair.sql` reasserts the scoped assignment-management helper, authenticated insert grant, and faculty assignment-publishing policy.

The database trigger only creates a college and administrator profile when a new Auth signup explicitly requests the `college_admin` onboarding flow. Faculty/student accounts are provisioned by a college administrator; role and college membership are assigned server-side.

Run structural database checks against a local Supabase stack:

```bash
npx supabase@latest start
npx supabase@latest test db
```

For production, also run the Supabase security advisors and verify the project Data API settings. The migration explicitly grants only the authenticated table operations used by the application; table grants and RLS policies are separate controls.

## 3. Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `http://localhost:3000` for local development.
- Add redirect URL: `http://localhost:3000/**`.
- Before deployment, add your Vercel production URL and preview URL pattern as appropriate.
- College administrator registration uses Supabase email confirmation. Faculty and student accounts are created by a college administrator with confirmed email and a temporary password, so their onboarding does not send an email.

Administrators can reset faculty/student passwords and share the new credentials through a secure channel. Members can change their own passwords and profile details after signing in. Supabase email delivery is still used for the optional self-service password recovery flow.

## 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 5. Deploy to Vercel

1. Create an **empty** GitHub repository named `campusclass` (or your preferred name). Do not initialize it with a README or license because this folder already contains those files.
2. From the extracted project folder, run:

   ```bash
   git init
   git add .
   git commit -m "Initial CampusClass release"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/campusclass.git
   git push -u origin main
   ```

   Replace `YOUR_GITHUB_USERNAME` with your GitHub account or organization. The repository is private/public according to the visibility you select when creating it.
3. In Vercel, choose **Add New → Project**, import the repository and use the Next.js preset.
3. Add all four environment variables from `.env.example` to the Vercel project. Use the same Supabase URL and keys for Preview/Production only where intended.
4. Set `NEXT_PUBLIC_APP_URL` to your production URL, for example `https://campusclass.vercel.app`.
5. Set `CRON_SECRET` to a long random secret in Vercel. It protects the deadline-reminder endpoint called by Vercel Cron.
6. Add your production URL and Vercel preview URL pattern to Supabase Auth redirect URLs.
7. Deploy. Vercel runs `npm install` and `npm run build` as configured in `vercel.json`. The daily cron runs at 08:30 India time and creates idempotent in-app reminders for assignments due within the next 36 hours.

No Supabase credentials are included in this repository. A live Supabase project must be configured before authenticated features can run. This source bundle does not create a GitHub repository or Vercel project in your accounts; create the empty GitHub repository and import it to Vercel using the steps above.

## Application routes

### Public and authentication

- `/` — landing page
- `/register` — college administrator registration
- `/login` — sign in
- `/forgot-password` and `/reset-password` — password recovery
- `/invite?token=...` — legacy invitation acceptance for unexpired invitations created by older builds

### Administrator

- `/dashboard`
- `/admin/faculty`
- `/admin/students`
- `/admin/departments`
- `/admin/subjects`
- `/admin/classes`
- `/admin/reports`
- `/admin/settings`

### Faculty

- `/dashboard`
- `/faculty/classes`
- `/faculty/classes/[id]`
- `/faculty/assignments`
- `/faculty/assignments/new`
- `/faculty/assignments/[id]`
- `/faculty/submissions`
- `/announcements`

### Student

- `/dashboard`
- `/classes`
- `/classes/[id]`
- `/join`
- `/assignments`
- `/assignments/[id]`
- `/results`
- `/announcements`

### Shared

- `/notifications`
- `/profile`
- `/settings`

## Security model

- Tenant membership and role are read from `profiles`, not browser-supplied metadata.
- The Auth trigger can bootstrap only a new college administrator; it cannot create faculty/student memberships.
- Faculty/student membership is created by the server-side administrator account-creation route and is not set from browser-supplied metadata. The legacy invitation acceptance route remains only for unexpired invitations created by older builds.
- Enrollment-code values and legacy invitation token values are never stored in plaintext; only SHA-256 hashes are stored.
- Joining a class is server-validated against college membership, class status and enrollment state.
- Submission timestamps and late status are generated server-side. Client-supplied timestamps are ignored.
- Evaluation marks and feedback live in `assignment_evaluations`, separate from student-readable submission rows. Student RLS can read only released evaluations.
- Storage buckets are private. Object policies check college, class and user path segments; signed URLs are short-lived. Students can clean up unsubmitted uploads, but cannot delete files after they are attached to a recorded submission.
- The service-role key is used only from server routes and never from browser components.

## Verification status and remaining production setup

The source package includes automated TypeScript/build scripts and structural pgTAP schema checks. This delivery environment does not contain your Supabase project credentials, a linked database, or a GitHub/Vercel account session. Consequently, hosted migrations, email confirmation, two-college RLS integration tests, live file upload/download behavior and a production deployment have not been executed here. Do not treat those external checks as passed until they are run against your Supabase project.

Before opening the application to real students, run an end-to-end acceptance pass with two separate colleges, each with an administrator, faculty member and students. Confirm that no account can read another tenant's data, that storage URLs fail outside the permitted class/owner scope, and that unreleased evaluations are invisible to student sessions.

## Development commands

```bash
npm run dev       # local development
npm run typecheck # TypeScript validation
npm run lint      # ESLint
npm run build     # production build
```


## CampusClass 1.1 — Expanded college LMS

This build brings together the academic workflow foundation from CampusClass with selected classroom collaboration and structured-learning workflows inspired by ScholaFlow, plus learning-platform capabilities reviewed in LMS Front.

### College-specific product model
- One platform serves many independent colleges.
- Every profile, class, course, assessment, stream, note, and certificate is tied to a college.
- Academic ownership follows College → Department → Subject → Academic Year/Semester → Class Section → Assigned Faculty → Enrolled Students.
- Students join a class inside their college using enrollment codes. Codes are never exposed as plaintext through ordinary table reads.
- The build intentionally excludes creator course sales, marketplace checkout, Stripe Connect instructor payouts, school-subdomain storefronts, and unrelated consumer monetization.

### Feature expansion
- **Class activity stream:** class-specific announcements, questions, assignment/material post types, pinning, scheduled publication fields, topics, comments and private faculty/student feedback threads.
- **Class chat:** college/class scoped messages with Supabase RLS; realtime-ready table.
- **Study workspace:** personal private notes and assignment to-do aggregation.
- **Structured learning:** college-owned courses by subject, modules, lessons, lesson completion and progress tracking.
- **Assessments:** quiz/exam records, multiple-choice/multi-select/true-false/short-answer question models, attempts and release controls.
- **Engagement:** XP/levels/streak data, achievements and college-issued certificates with verification metadata.
- **Academic experience:** separate dashboards and role-scoped navigation for administrators, faculty and students.

### New migration
`supabase/migrations/202611170002_learning_collaboration.sql`

Apply migrations in order. Review policies in a staging Supabase project before production, particularly quiz answer-key visibility and certificate verification policies. `quiz_questions.answer_key` must not be selected by student-facing queries; for high-stakes exams, move answer keys into a non-exposed table and grade through a server-side function before enabling live assessments.

### Implementation status
This ZIP contains the schema and core screens for the added modules. The newly added modules require end-to-end testing against a real Supabase project. Quiz-taking/automatic grading UI, certificate PDF rendering, scheduled stream publication worker, realtime subscription wiring, rich-text authoring UI, and the complete AI tutor are not represented as production-complete features yet. They are explicitly tracked as follow-up implementation work rather than simulated with fake data.
