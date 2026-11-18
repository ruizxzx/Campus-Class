# Testing, verification and acceptance

## Automated checks in GitHub Actions

The `.github/workflows/ci.yml` pipeline must pass on the exact PR commit AND after merging to main:

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm test:security
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Vitest unit tests live in `tests/unit/` and are scoped via `vitest.config.ts`. Node security/feature regression tests live in `tests/*.node.mjs`. Playwright desktop/mobile public UI smoke and optional authenticated journeys live in `e2e/`. A passing public browser smoke is **not a substitute for authenticated staging acceptance**.

The multi-role Playwright journeys deliberately skip if staging credentials are absent. To run them, deploy a disposable seeded staging site (NOT production), set `E2E_BASE_URL` and `E2E_{ADMIN,FACULTY,STUDENT}_{EMAIL,PASSWORD}` to fictional test accounts, then run `pnpm test:e2e`. Never put real student passwords into repository secrets or logs.

## Required manual staging tests

1. **Migration order:** apply missing migrations 001–037 (and later) to a disposable Supabase project; validate all SQL/pgtap suites in `supabase/tests/`. Do not apply the same patch blindly twice or execute data-mutating fixtures in production.
2. **Tenancy:** create two fictional colleges with an admin, faculty member and two students each. Check authenticated rows and server API denials across colleges and classes.
3. **AI:** configure an OpenRouter key via Admin Settings, verify Vault storage path and a student Copilot response with no legacy master key; check history survives reload, clear history, and an interrupted save displays `history_saved: false`; test disabled AI, 429 quotas, invalid credentials and long/expired PDF URLs.
4. **Learning Studio:** publish and edit a course with multiple chapters, reorder lessons, unpublish a lecture, archive and republish it; verify student completion IDs remain stable; have two staff sessions edit the same course and confirm the stale save returns HTTP 409.
5. **Assessments:** create questions from bank, publish a timed quiz, reload to restore drafts, attempt late submission and inspect database denial, verify release timing and students cannot see answer keys. Test manual grading for descriptive answers.
6. **Gradebook/Outcomes:** submit assignment versions and quiz attempts; keep marks unreleased, then release, confirm only released/latest/best results contribute and policy percentages sum to 100. Export CSV and print; test against a roster with no grades and excused attendance.
7. **Student Success:** include a student who joined after earlier attendance sessions, a student with excused absences, and one lacking evidence; verify fair denominators, observed eight-week trends, configurable admin thresholds and interventions' follow-up dates/outcomes.
8. **Mobile/accessibility:** real mobile 320/375/768 px, tablets and desktops; verify navigation drawer scrolling, focus, touch controls, forms, table overflow, screen reader names and dark mode.
9. **PWA/network:** install and open offline shell, verify private authenticated resources/grade pages are not cached, then restore connection; ensure notes drafts and sync behavior match displayed capabilities.
10. **Operational:** verify Vercel deployment actually uses frozen pnpm lockfile, real Supabase environment keys and Auth redirects; verify Cron secret, quota, upload limits, payment budget, error logs and alerts.

## Test limitations

There is no available connected Supabase project named Campus Class; connected Supabase accounts show other projects only. This workflow therefore **does not run or claim live Campus Class migrations, pgTAP, provider integration or real authenticated browser tests**. Those remain necessary for deployment certification. Additional features such as durable full-text PDF/pgvector and predictive model training require careful resource-specific integration rather than invented test results.
