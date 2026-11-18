# Campus Class 2.0

**Campus Class** is a college-scoped academic learning workspace for administrators, faculty and students, built using Next.js 16, React 19, TypeScript, Supabase Auth/Postgres/Storage, Tailwind CSS and pnpm. Repository: https://github.com/ruizxzx/Campus-Class.

> **Release status:** automated code checks and public browser smoke tests run in GitHub Actions. **Production readiness is not certified** until the college's own database migrations, authentication, two-tenant isolation, OpenRouter billing, and actual device tests pass on an isolated staging deployment. The assistant does not execute forward SQL patches on your hosted database.

## Features

**Administrator:** institutional onboarding, departments, subjects, class roster, faculty assignments, user management, college AI provider connection, support thresholds, course and quiz authoring, grade policies, notifications, reports and audit records.

**Faculty:** assignments/projects, submission evaluations with separate mark release, attendance QR sessions/corrections, timetable, announcements and class stream/chat, courses with chapter/lesson editing and publication, question bank/assessments, Student Success follow-up plans, class Gradebook/Outcomes.

**Student:** class enrollment, private assignments/submissions, timed quizzes, released results, courses with completion progress, syllabi, AI Study Copilot grounded in published text or an explicitly selected syllabus PDF, notes, to-dos, notifications, PWA shell.

**Security by design:** session-bound profiles, college-scoped database relations, RLS and service-only server APIs, release-gated grade visibility, no browser-supplied service-role keys, signed private resource URLs, atomic database quiz/timetable/attendance/course guards, rate-limited AI requests.

## Requirements and installation

Use Node.js 22 and **pnpm 10.0.0**. The repository commits `pnpm-lock.yaml`; do **not** use `npm install` or generate an unrelated `package-lock.json`.

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Complete these server/client configuration settings in `.env.local` and the corresponding Vercel deployment environment:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | **Campus Class** Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client/server | project publishable API key (not service key) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | privileged operations from verified API routes |
| `NEXT_PUBLIC_APP_URL` | client/server | deployment root URL (no secret) |
| `CRON_SECRET` | server only | deadline reminder Cron authentication |
| `OPENROUTER_ENCRYPTION_KEY` | server only, **legacy optional** | original 32-byte base64 master key for existing AES-encrypted rows only; **not needed for new keys after Vault SQL 032** |

Never commit real values, put a service key in a `NEXT_PUBLIC_` variable, or print Vault decrypted secrets.

## Supabase database

This project uses an **incremental, forward-only SQL migration chain** in `supabase/migrations/`. Apply only **missing** patches in lexicographic order using your **Campus Class project's** Supabase SQL Editor after backing up, testing on a disposable staging project and reviewing each change. Do **not** re-run old patches blindly. The assistant has not executed any production SQL.

- `202611170001` through `202611180028`: core tenant/academics, protected quiz/learning, class stream/chat, planning, attendance and timetable.
- `202611180029`: database-clock attendance and quiz session guards.
- `202611180030`: hourly atomic AI request quota.
- `202611180031`: support intervention planning/outcome notes.
- `202611180032`: Supabase Vault for college OpenRouter API secrets.
- `202611180033`: reusable, staff-only question bank.
- `202611180034`: per-class grading weights.
- `202611180035`: configurable college Student Success rules.
- `202611180036`: atomic course creation/edit, non-destructive publication, staff authorization and revision conflict guard.\n- `202611180037`: private student Copilot chat history with idempotent retries and clear history.

Full filenames and ordered rollout details: **[deployment guide](docs/CAMPUSCLASS_2_0_COMPLETION.md)**. Run structural SQL checks in `supabase/tests/` on a **disposable** database seeded with at least two fictional colleges; do not seed production accounts with test data.

### Repair the "college AI encryption key is not set" issue

Storing the OpenRouter API key in Admin Settings previously required a **different** server-side `OPENROUTER_ENCRYPTION_KEY` to decrypt the saved ciphertext. New keys instead use Supabase Vault.

1. Apply migration 032 and all earlier required migrations to the **actual Campus Class** Supabase project. Make sure 030 AI quota is present.
2. Deploy the matching GitHub version to Vercel.
3. Open **Admin → AI settings** and **re-enter the real college OpenRouter key**, select the model, enable AI, and save. This action moves the key into Vault.
4. Test as an enrolled student in **AI Study Copilot** and review authenticated server logs. If a key was saved under the legacy AES scheme and the original master key is lost, it cannot be reconstructed; saving the OpenRouter key again is required.
5. Check provider plan, billing, per-user hourly quota and permissions before enabling institution-wide usage.

## Build and test

```bash
pnpm test:security    # Node feature & security regression tests
pnpm test:unit        # Vitest pure-unit suite
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e         # local public browser smoke
```

GitHub workflow `.github/workflows/ci.yml` runs Node regressions, unit tests, typecheck, lint, production build and public desktop/mobile Chromium E2E tests. Tests under `e2e/roles.spec.ts` are **skipped** unless staged credentials are supplied; running public browser smoke does NOT verify authenticated multi-college isolation.

To run authorized read-only multi-role tests on a disposable staging site, set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_FACULTY_EMAIL`, `E2E_FACULTY_PASSWORD`, `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`; then run `pnpm test:e2e`. **Never use real student credentials in CI or production test runs.**

## Production deployment

1. Use existing [Campus Class repository](https://github.com/ruizxzx/Campus-Class), branch `main`; you do **not** need to create another GitHub repository.
2. Ensure Vercel project imports `main` and uses the committed `vercel.json` (`pnpm install --frozen-lockfile`, `pnpm run build`, and India-oriented Cron schedule).
3. Apply all needed SQL patches to your Campus Class project **before enabling new features that require them**, ideally with maintenance/feature gates and rollback backup.
4. Set the Vercel environment keys and Supabase Auth site/redirect URLs to your actual deployment, and complete the Vault admin re-key procedure.
5. Validate faculty/student/admin accounts, submissions/grades release, attendance QR, quiz session expiration, course editing, AI PDF questions, 320px+ mobile layouts, keyboard navigation, PWA and provider failure behavior on a staging site.
6. Review [deployment acceptance checklist](docs/CAMPUSCLASS_2_0_COMPLETION.md), [architecture](docs/ARCHITECTURE.md) and [API/security notes](docs/SECURITY_AND_API.md).

## Important limitations

Current AI assistance accepts a short-lived authorized syllabus PDF via OpenRouter. **It is not a persistent PDF extraction + page-aware pgvector retrieval system.** Rule-based support signals are not a validated predictive ML model. Comprehensive Bengali/Hindi content translations, certified high-stakes exam proctoring, offline private PDF caching and an actual live multi-college acceptance pass are also not completed. No codebase can reasonably be certified absolutely bug-free from a CI run alone.

License: see the repository's license if present.
