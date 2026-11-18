AGENTS.md — CampusClass
Project-wide instructions for coding agents, AI assistants, and human contributors. These instructions apply to the entire repository unless a more specific AGENTS.md in a subdirectory adds narrower rules.
1. Product mission
CampusClass is a college-first, multi-tenant academic management and learning platform. It serves multiple independent colleges from one application while giving each college its own administrators, faculty, students, departments, subjects, class sections, courses, assessments, academic activity, and records.

The core academic hierarchy is:

College → Department → Subject → Academic year / semester → Class section → Assigned faculty → Enrolled students

CampusClass is not a creator-course marketplace or a generic consumer LMS. Adapt useful LMS patterns to institutional teaching and learning. College-owned teaching materials, assignments, assessments, student progress, class collaboration, and college-issued credentials are in scope. Creator storefronts, student course purchases, instructor payouts, and marketplace monetization are out of scope unless the product owner explicitly approves them.

Primary roles:
- admin: administrator of one college workspace.
- faculty: member of a college who can work only in explicitly assigned classes and academic resources.
- student: member of a college who can access only classes they have actively joined and the academic resources released to them.
A user must never gain access to another college by changing a URL, request body, UUID, query parameter, browser state, or client-side role value.
2. Non-negotiable engineering principles
1. Inspect before changing. Read the relevant page, component, API route, validation schema, database migration, and existing helper before editing. Preserve working architecture and behavior.
2. The database is the source of truth. Do not replace real Supabase records with mock arrays, hardcoded dashboard metrics, local storage, or fake success states.
3. Security is server- and database-enforced. UI visibility and role-based navigation improve usability; they are not authorization.
4. College isolation is mandatory. Every tenant-owned record and relationship must be scoped to the correct college_id, enforced with constraints and RLS.
5. Class membership is an additional boundary. Within a college, faculty access requires an explicit faculty/class assignment; student access requires an active enrollment.
6. Use migrations for every schema or policy change. Never ask an operator to make an undocumented manual production database edit.
7. Validate untrusted input. Validate route bodies, query values, uploaded files, and user-provided strings on the server. Do not trust client timestamps, roles, college IDs, marks, file paths, or ownership assertions.
8. Keep privileged credentials server-only. Never put a Supabase service/secret key in a NEXT_PUBLIC_ variable, Client Component, browser bundle, log, or committed file.
9. Test the behavior changed. A typecheck alone does not prove correct authorization, business logic, SQL, storage access, or user experience.
10. Be accurate about completion. Distinguish implemented UI, wired backend functionality, tested behavior, and future/partial capabilities. Do not claim an untested feature is production-ready.
3. Technology and repository architecture
Current stack:
- Next.js App Router (Next.js 16) and React 19.
- TypeScript in strict mode.
- Tailwind CSS v4, with shared CSS variables and reusable class patterns in app/globals.css.
- Supabase PostgreSQL, Auth, Storage, Row Level Security, and @supabase/ssr.
- Zod for request/form validation; React Hook Form is available for complex forms.
- Lucide React for icons; Sonner for toast notifications; Recharts for data visualizations; date-fns for date formatting.
- Radix UI, Lexical, Motion, TanStack Query and i18n packages are dependencies available for use where needed; do not assume that all are already integrated into a feature.
- Vercel hosting and a Vercel Cron endpoint for deadline reminders.
Important paths:
Path	Responsibility
app/(app)/	Authenticated role-specific product pages
app/(auth)/	Login, registration, invitations, and password flows
app/api/	Server-side operations and privileged workflows
app/auth/callback/	Supabase authentication callback
components/	Reusable UI and client-side interaction components
lib/auth.ts	Profile loading and route-level role redirects
lib/http.ts	Authenticated API request context and response detection
lib/validators.ts	Shared Zod schemas for untrusted input
lib/supabase/client.ts	Browser Supabase client
lib/supabase/server.ts	Cookie-aware server Supabase client
lib/supabase/admin.ts	Server-only privileged Supabase client
types/database.ts	Shared application domain types; keep aligned with the SQL schema
supabase/config.toml	Supabase local project configuration
supabase/migrations/	Ordered PostgreSQL schema, function, grant, trigger, storage and RLS changes
supabase/tests/	SQL/pgTAP database checks
reference-assets/scholaflow/	Selected ScholaFlow visual reference assets; preserve applicable license attribution
docs/FEATURE_MERGE.md	Feature merge decisions and explicit limitations
BUILD_NOTES_1.1.md	Build 1.1 feature status and known incomplete work
DEPLOYMENT_CHECKLIST.md	Staging and production handoff checklist


Next.js route groups (app) and (auth) are organizational and do not appear in public URLs. Follow the existing App Router structure. Keep route-specific UI in its page/route and extract reusable behavior into components/ or lib/ rather than creating oversized components.
Existing route areas
- Public: /, /register, /login, /forgot-password, /reset-password, /invite.
- Admin: /dashboard, /admin/faculty, /admin/students, /admin/departments, /admin/subjects, /admin/classes, /admin/reports, /admin/settings.
- Faculty: /dashboard, /faculty/classes, /faculty/assignments, /faculty/submissions, /announcements.
- Student: /dashboard, /classes, /join, /assignments, /results, /announcements.
- Expanded shared learning/collaboration: /calendar, /certificates, /chat, /courses, /notes, /quizzes, /stream, /todo.
- APIs include class joining, invitations, profile/college settings, submission evaluation, announcement notifications, and deadline reminders. Inspect the route tree before assuming a path or feature exists; routes may evolve.
4. Authentication and authorization
4.1 Trusted identity
- Use supabase.auth.getUser() or another verified server-side Auth method in server operations. Do not authorize based solely on an unverified local session object.
- Load the user's active profiles row to determine college_id, role, and status.
- Existing helpers in lib/auth.ts are getProfile(), requireProfile(), and requireRole().
- API routes should normally use requestProfile() from lib/http.ts and return immediately when isResponse(context) is true.
- Never trust user_metadata or a request-body field for privileged authorization decisions. User metadata can be modified by the user. The database profile and server-verified identity are authoritative.
- Users must not be able to change their own role, college_id, or account activation state through profile update endpoints.
4.2 Role permissions
- Administrator: may manage only their own college. Never allow an administrator to operate on another college by substituting a college_id.
- Faculty: may manage learning activity only in assigned classes and within explicit permissions such as can_manage_assignments. Do not silently broaden one faculty member's permissions because they can see a class or because a page hides another action.
- Student: may access only active enrolled classes and their own private submissions, notes, to-do items, attempts, and released results. Students must not see another student's private work, unreleased marks, private feedback, or answer keys.
- Enforce permissions in API/server code and RLS. Client-side redirects and conditional buttons are not sufficient.
4.3 Supabase clients
- lib/supabase/client.ts is for Client Components and uses the public publishable key.
- lib/supabase/server.ts is for server-side cookie-aware Supabase access through @supabase/ssr.
- lib/supabase/admin.ts imports server-only and creates the privileged client. Import it only from server-only modules such as Route Handlers or server actions. Never import it, directly or indirectly, from a Client Component.
- Server-only values belong in .env.local or Vercel environment settings and must never be committed.
- Current public environment variable: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- Current server-only environment variables: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
- NEXT_PUBLIC_APP_URL is used to build application links. Keep .env.example synchronized when adding or renaming environment variables.
4.4 Privileged server operations
Use the admin client only when the operation genuinely requires privileges unavailable to the authenticated Data API client. Before every privileged query or mutation:
1. Authenticate the caller.
2. Load their active profile from the authenticated server context.
3. Enforce role and class/college ownership in server code.
4. Validate input with Zod.
5. Add explicit tenant filters to privileged queries (college_id, and class/user IDs where relevant). The service-role client bypasses RLS.
6. Return a minimal response; never return secrets or another user's private data.
7. Record material academic/admin actions in activity_logs when appropriate.
Do not use the service-role client to work around a broken RLS policy without identifying and fixing the underlying authorization model.
5. Database and migration rules
The migrations are ordered and are the canonical database implementation:
- 202611170001_campusclass_core.sql — core colleges, profiles, invitations, departments, subjects, classes, faculty assignments, enrollments, hashed enrollment codes, assignments, submissions, separate evaluations, announcements, notifications, activity logs, storage buckets and policies, helper functions and baseline RLS.
- 202611170002_learning_collaboration.sql — class topics/stream posts/targets/attachments/comments, class messages, personal notes, to-do items, quizzes/questions/attempts, college-owned courses/modules/lessons, lesson progress, student learning stats, achievements and academic certificate records.
Before writing a migration:
1. Read both existing migrations and identify current tables, constraints, helper functions, grants, triggers, policies and storage path conventions.
2. Search for an existing representation before creating another table or duplicate column.
3. Add a new ordered migration; do not rewrite an already-applied migration to make an existing environment appear updated.
4. Use UUID keys, explicit foreign keys, appropriate unique/check constraints, indexes, created_at/`updated_at` where appropriate, and composite tenant-aware references.
5. Include RLS and explicit grants/revokes for every new exposed table. Table privileges and RLS are separate controls.
6. Ensure USING and WITH CHECK predicates protect both row access and updates that could reassign tenant/owner identifiers.
7. Keep privileged functions in the non-exposed private schema where appropriate; use a fixed/empty search_path, schema-qualify object references, validate auth.uid() and revoke default PUBLIC/`anon` execution. Grant only the required authenticated/server roles.
8. Avoid recursive RLS policies. Reuse the reviewed helpers in the core migration where possible: private.current_college_id(), private.current_role(), private.is_admin(uuid), private.is_faculty_in_class(uuid), private.is_enrolled_in_class(uuid), private.can_manage_class(uuid), private.can_access_class(uuid), private.can_access_assignment(uuid), private.assignment_belongs_to_class(uuid, uuid), and private.can_view_profile(uuid).
9. Do not grant direct Data API access to sensitive fields such as enrollment-code hashes, submission writes, evaluation writes, invitation token hashes or quiz answer keys. Use explicit column-level grants only where they are demonstrably safe.
10. Test migrations against a clean disposable database and validate upgrade behavior. A successful file write is not a successful migration.
Never drop/recreate production data to make a migration pass. Do not change existing migration history without a documented recovery plan.
Critical data boundaries
- Every tenant-owned table must carry college_id or have an unambiguous tenant-safe composite relationship.
- Cross-college foreign-key relationships must be impossible by database constraints, not just filtered in React.
- Keep evaluation records separate from student-readable submission records. Student visibility requires released_at IS NOT NULL.
- Enrollment codes and invitation tokens must be cryptographically random and stored as hashes; compare hashes server-side.
- Use server-generated timestamps for joins, submissions, grading and release events.
- Do not trust a student's submitted marks, evaluation status, submission version, ownership, or timestamp.
- quiz_questions.answer_key is sensitive. Do not select it in student-facing code or expose it via a PostgREST grant. High-stakes assessments require a private answer-key store and server-side grading before activation.
- Certificate verification must expose only minimal verification fields through a deliberate lookup endpoint. Do not grant anonymous table-wide certificate listing.
- Class stream posts, comments and chat must be checked against class membership and class roles. Private comments must remain private to their intended audience.
- Notes and to-do items are owner-private. Never let a faculty or administrator read them merely because they are in the same college.
6. Supabase Storage
- Keep assignment references, student submissions, and profile images in private buckets.
- Preserve and validate the documented path format and the RLS checks in storage.objects policies. The original core migration uses paths incorporating college, class, assignment, and (for student submissions) student IDs.
- Validate actual file MIME type, allowed extension, byte size, ownership, and target assignment/class on the server. The browser's accept attribute is not security validation.
- Use short-lived signed URLs only after server-side authorization, or use the authenticated Storage API where its RLS policy covers the operation.
- Do not store publicly accessible private file URLs. Prefer storage object paths.
- For file replacement/upsert, ensure the necessary Storage INSERT, SELECT, and UPDATE permissions/policies are present.
- Clean up orphaned files and database references safely; do not delete a file still referenced by a recorded submission.
7. API Route and validation conventions
- Use Next.js Route Handlers under app/api/**/route.ts for server operations.
- Set runtime = "nodejs" when using Node APIs, node:crypto, or other Node-only dependencies.
- Authenticate with requestProfile() and enforce the caller's role before using the privileged admin client.
- Add or reuse a Zod schema in lib/validators.ts. Use safeParse; return a clear 400 response for invalid input.
- Return appropriate HTTP status codes: 401 unauthenticated, 403 unauthorized, 404 unavailable/not found where avoiding disclosure is appropriate, 409 conflicts/duplicate actions, 400 malformed input, and 500 unexpected server failures.
- Do not leak Supabase internals, stack traces, service-role data or private row contents in API errors.
- Handle duplicate/unique constraint violations deliberately (Postgres 23505 is a common conflict case).
- Privileged operations must add explicit college_id filters using the authenticated profile. RLS does not protect queries made with the service-role client.
- Keep server-side business rules centralized and shared where possible; do not duplicate rules across multiple components or endpoints.
8. Frontend, design system, and accessibility
8.1 Product visual direction
Use the current CampusClass design system: premium, minimal, Apple-inspired, accessible, calm, and college-oriented.
- Light mode is the default; dark mode must continue to work with the CSS variables in app/globals.css.
- Use the forest-green accent, neutral surfaces, subtle borders, restrained shadows, clean typography and consistent spacing.
- Prefer the existing .surface, .surface-flat, .btn-primary, .btn-secondary, .input-base, .status-pill, .table-wrap, and typography utilities where appropriate. Inspect current markup before introducing new utility conventions.
- Reuse components from components/ui.tsx and the existing AppShell before creating parallel patterns.
- Use ScholaFlow reference assets only when they improve a useful empty state or explanatory surface. Do not use unrelated creator/consumer marketing visuals in college workflows.
- Do not copy large third-party components or source trees. Adapt concepts and respect THIRD_PARTY_NOTICES.md and upstream license files.
- Avoid unnecessary gradients, blur, visual noise, oversized cards, and ornamental charts.
8.2 Interaction quality
- All visible controls must perform a real action or be clearly disabled/labelled as unavailable. No placeholder buttons that imply working features.
- Show loading, empty, error, success, and disabled states.
- Use Sonner for clear user-facing feedback; do not show a success toast before the server confirms success.
- Keep forms keyboard accessible, label inputs, preserve focus order, provide visible focus states, and use semantic buttons/links.
- Mobile layouts must avoid horizontal overflow and use touch-friendly hit targets.
- Dates and deadlines should be displayed consistently using date-fns, while storing timestamps as server/database timestamps.
- Use optimistic UI only when rollback/error handling is implemented and the state transition is safe.
- Never show private feedback, marks, answer keys, submission details or chat content to a role that is not authorized to see them.
8.3 React / Next.js conventions
- Server Components are the default. Add "use client" only for interactive state, browser APIs, or client-only libraries.
- Do not pass server secrets or privileged Supabase clients into Client Components.
- Fetch data on the server for protected pages where practical, and rely on RLS as the final row-level guard.
- Keep Client Components focused; move validation, authorization and business logic to server code.
- Use stable keys, typed props, explicit loading/error handling and avoid any. If a Supabase embedded relation requires a type assertion, keep it narrow and document the expected relation shape.
- Use next/link for internal navigation and next/image where image optimization is useful.
- Keep app/layout.tsx, app/globals.css, components/theme-provider.tsx, and components/app-shell.tsx consistent with the app-wide theme and shell behavior.
9. Feature status and roadmap honesty
Build 1.1 contains the core pages/schema for added learning and collaboration modules, but not all advanced reference features are complete. Treat BUILD_NOTES_1.1.md and docs/FEATURE_MERGE.md as the source of truth for current limitations.

Known incomplete or not production-certified areas include:
- Full quiz authoring, timed student attempts, attempt limits, server-side grading, review controls, and grade release UX.
- A private answer-key design suitable for high-stakes exams and security tests around it.
- A complete rich-text editor for stream posts, lessons and notes.
- Supabase Realtime wiring for class chat/streams, moderation, pagination and abuse/rate-limit controls.
- A scheduled stream-post publication worker.
- Certificate PDF creation, public verification endpoint, and revocation UI.
- Automatic XP awarding, streak calculation, achievement criteria, challenges and leaderboards.
- The AI tutor/MCP service and institution-scoped retrieval controls.
- Complete locale bundles and production translation workflows.
- Full automated cross-college RLS and storage integration tests for migration 2.
Do not tell users that these capabilities are complete based solely on the presence of a table, route, dependency, or navigation link. Implement the full user flow and tests before updating product documentation to mark them complete.
10. Testing and verification workflow
Use Node.js 20.9+; the repository currently uses Node 22 in CI.

From the repository root:
npm install
npm run typecheck
npm run lint
npm run build
Local development:
cp .env.example .env.local
# Fill in the Supabase URL and publishable key; keep server-only secrets private.
npm run dev
Database checks (requires Supabase CLI and a running local Supabase stack):
supabase start
supabase db reset
supabase test db
Before declaring a feature ready, test relevant combinations of:
- Two separate colleges.
- At least one admin, one faculty member, and multiple students in each college.
- Faculty assigned to one class but not another.
- Students enrolled in some classes but not others.
- Active, inactive, removed, expired and duplicate enrollment/invitation conditions as relevant.
- Unreleased and released grades.
- Private files and signed URL expiration.
- Attempts to access another college by changing IDs in URLs and requests.
Minimum security regression cases:
1. College A cannot query, mutate or download College B data.
2. A faculty member cannot manage a class to which they are not assigned.
3. A student cannot access a class without an active enrollment.
4. A student cannot read another student's submission, note, to-do, quiz attempt or private comment.
5. A student cannot read unreleased marks, feedback, or quiz answer keys.
6. Client-side role/college metadata changes do not change database permissions.
7. Enrollment and invitation tokens are not readable in plaintext.
8. Private files cannot be downloaded by an unrelated account or unauthenticated visitor.
9. Service-role operations cannot be redirected to another college by user-supplied IDs.
10. Inactive profiles cannot access protected operations.
The current package scripts include dev, build, start, lint, typecheck, test:unit, and test:e2e. Inspect the repository for actual test files/configuration before assuming unit or Playwright E2E coverage exists. The included SQL file supabase/tests/campusclass_schema.test.sql contains structural pgTAP checks; structural checks do not replace behavioral RLS tests with real role/tenant fixtures.

When any command fails:
1. Capture the complete error and the command/environment.
2. Identify whether it is source, dependency, configuration, SQL, Auth, RLS, Storage, or external-service related.
3. Fix the root cause rather than suppressing the error.
4. Re-run the targeted check, then the broader relevant checks.
5. Record any remaining environmental blocker accurately.
11. Deployment and environment
- Vercel project configuration is in vercel.json; the project targets the Next.js framework and Mumbai region (bom1).
- vercel.json schedules /api/cron/deadline-reminders. Keep its authorization check and CRON_SECRET aligned with Vercel Cron configuration.
- GitHub Actions CI is in .github/workflows/ci.yml. Keep CI commands and required environment variables synchronized with package.json and the application.
- Do not commit .env.local, database passwords, API keys, service-role/secret keys, invitation tokens, or real student data.
- Do not run production migrations automatically from an ordinary application request or from a frontend build.
- Apply reviewed migrations to staging first; verify clean install and upgrade behavior; run the tenant/role/storage test matrix; then deploy to production.
- Add production and preview URLs to Supabase Auth redirect allowlists. Configure SMTP before relying on invitation/password emails.
- Keep production logs free of passwords, auth tokens, submission documents, private feedback, and sensitive student information.
12. Documentation maintenance
When changing behavior, update the relevant documentation in the same change:
- README.md — setup, scripts, routes and deployment instructions.
- docs/FEATURE_MERGE.md — product scope and feature adaptation decisions.
- BUILD_NOTES_1.1.md — what is implemented, partial, tested and not yet done.
- DEPLOYMENT_CHECKLIST.md — required staging/production checks.
- .env.example — every new environment variable, with safe placeholder values only.
- types/database.ts — application types when schema-facing types change.
- THIRD_PARTY_NOTICES.md — any new third-party code/assets and license obligations.
Do not remove a known limitation from documentation unless the underlying implementation and verification have actually been completed.
13. Definition of done
A change is done only when all applicable points are true:
- The requested college academic workflow is implemented end-to-end.
- The correct role and class membership are checked on the server and in RLS.
- Cross-college relationships are prevented by constraints and tested.
- Inputs and file operations are validated.
- Loading, empty, error and success states are present.
- Desktop and mobile layouts are usable and accessible.
- Relevant typecheck, lint, build, migration and behavioral tests pass.
- Documentation and types match the implementation.
- No secrets, real student data, or fake success states have been introduced.
- Known gaps and external verification blockers are disclosed rather than hidden.
When in doubt, prioritize student privacy, college data isolation, academic integrity, accessibility, and reliable workflows over adding more features.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
