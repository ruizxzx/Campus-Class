# Campus Class 2.0 Completion: Deployment & Production Acceptance

Source: https://github.com/ruizxzx/Campus-Class

This update adds a Supabase Vault AI-key path, reusable question bank, direct private
syllabus PDF assistance, and stronger Student Success, Gradebook and Outcomes workflows.

## Deploy without losing AI keys

The OpenRouter API key configured in the Admin UI and the old
`OPENROUTER_ENCRYPTION_KEY` were separate. The latter was a server-side
AES-256-GCM master key, required to decrypt previously stored API keys.
The old key cannot be reconstructed from ciphertext.

**New setup:** Supabase Vault holds the college OpenRouter key encrypted with
the Supabase-managed root encryption key. Vercel's environment variable
`OPENROUTER_ENCRYPTION_KEY` is not required for NEW college keys.

1. Back up and test in a disposable, isolated Supabase project with all previous
   Campus Class migrations.
2. Run missing migrations **026, 027, 028, 029, 030, 031**, in sequence.
   Use the actual `supabase/migrations/` filenames; do not re-run patches
   that have already been applied without checking.
3. Run [032: college AI Vault](../supabase/migrations/202611180032_college_ai_vault.sql),
   [033: question bank](../supabase/migrations/202611180033_question_bank.sql),
   [034: configurable Gradebook weighting](../supabase/migrations/202611180034_class_gradebook_policies.sql),
   and [035: Student Success support rules](../supabase/migrations/202611180035_student_success_rules.sql)
   using the SQL Editor **in that order**. None is run by ChatGPT.
4. Deploy the corresponding GitHub build.
5. Sign in as college administrator → **Admin → AI settings**. Enter the
   original college **OpenRouter API key**, confirm the desired model and
   Enabled switch, and **Save AI settings**. This transfers the new value to
   Vault and removes the old ciphertext/IV/tag from that college row.
6. Confirm the admin page says the college key is configured and does not show
   the old-key warning. Sign in as a student in an active class; ask Copilot
   a basic question and a second question with a PDF selected.
7. If the old `OPENROUTER_ENCRYPTION_KEY` was available and correct, keep it
   until every legacy college has moved to Vault. Never replace it with
   a different random key to "repair" existing ciphertext.

If a college has not moved its old encrypted key into Vault and its
original master key is missing, the UI will ask its administrator to re-save.
**An already-saved API key alone does not eliminate this migration step.**

### Non-secret checks after migration

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='college_ai_settings'
  and column_name='api_key_vault_id';

select college_id, enabled,
       api_key_vault_id is not null as uses_vault,
       api_key_ciphertext is not null as legacy_encrypted
from public.college_ai_settings;

select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('question_bank_items','ai_request_usage',
    'class_gradebook_policies','student_success_rules');
```

These checks reveal no plaintext API secrets. Do not query
`vault.decrypted_secrets` just to verify configuration.

## Delivered updates

- **AI Copilot:** newly saved college API secrets use Supabase Vault;
  old ciphertext is not dropped until admin re-saves; on-demand syllabus
  PDF selection signs a short-lived, authorization-checked URL and passes
  it to the OpenRouter PDF parser. Study citations differentiate outlines
  from explicitly attached PDFs. OCR quality depends on PDF content.
- **Question Bank:** college- and subject-scoped, staff-only reusable
  MCQ, multi-select, true/false and manually graded short-answer questions.
  Faculty may browse/import, save, update their questions and archive them.
  Reusable bank items do not expose answers to students.
- **Student Success:** per-class evidence and actionable faculty
  interventions; active and overdue follow-up counts; exportable
  *filtered* academic signals; college administrators can configure the
  attendance, overdue work and quiz-score support thresholds.
  Signals are explainable rules, not diagnoses.
- **Gradebook:** paged assessment evidence; only released scores displayed,
  duplicate quiz attempts consolidated to the best released attempt;
  per-learner recorded average, optional per-class category weighting
  configured by authorized staff, score distribution, CSV and print.
  Missing scores remain unknown; unconfigured weights do not imply an
  official grading rule.
- **Outcomes:** only released latest-assignment evaluations and best
  released quiz marks contribute; faculty can edit targets, view linked
  evidence and unlink mappings, export/print reports and inspect gaps.
  Subject/class permissions are re-checked.
- **Learning Studio:** drag-and-drop chapter and lecture ordering with\n  accessible move-up/move-down button alternatives.\n- **Regression coverage:** GitHub pipeline executes Node tests,
  TypeScript, lint and Next.js production build.

## Required production checks before declaring release ready

- Run all migrations on a disposable Postgres/Supabase staging project,
  including RLS and pgTAP suites; confirm the Vault extension is present.
- Exercise two separate colleges with students/faculty/admins; attempt
  cross-college resource and question-bank access. Check both API and RLS.
- Test OpenRouter credentials + provider billing, the quota RPC, key rotation,
  AI with/without PDFs, expired signed URL behavior and long/malformed PDFs.
- Confirm timed quiz expiry, draft recovery, question-bank imports, grading
  release timing, Gradebook averages, per-class weight calculation, Student
  Success threshold adjustments and Outcomes mapping denominators.
- Test interventions, exports, mobile layout and keyboard interactions on
  actual browsers/devices; run end-to-end journeys against seeded staging.
- Inspect production Vercel environment, logs, storage rules, job schedules,
  cost limits and alerting before treating the app as production-certified.

## Known non-completed requirements

- A durable full-document text extraction/embedding/pgvector retrieval
  pipeline is not implemented; PDF assistance is on-demand through OpenRouter.
- Verified predictive-model training is not present; Student Success rules
  are transparent heuristic signals.
- Secure/high-stakes exam proctoring and negative marking are not implemented.
- Authoring is keyboard-reorderable but does not yet support drag/drop.
- Entire-app Bengali/Hindi translations and user content translation are
  incomplete; basic navigation UI is multilingual.
- Secure offline PDF caching and multi-device offline notes sync are not
  implemented. No live Supabase integration/E2E acceptance has been run
  against the user's production project.

Passing CI certifies the checked code paths only; it is not a guarantee of
zero bugs or full production certification.

## Selected personal notes in the student AI Copilot

The Copilot lists the signed-in student's own note titles, and sends the text of
**one explicitly selected note** (up to 6,000 characters) to the configured
college AI provider only for that request. The default is **do not share**.
The API checks both college and user ownership and returns HTTP 403 for an
unavailable note; it never reads another student's note for context. Notes
are treated as untrusted reference data and can be cited as a personal source.

## Academic reporting failure (all three pages): new safe diagnostics

For `/success`, `/gradebook` and `/outcomes`, expected database
errors and incomplete evidence now render a readable, non-destructive status
instead of an uncaught server-component exception. Administrators can open
`/admin/academic-health` to check service-role connectivity, required
objects and key columns without exposing private student records.
This screen cannot repair a database with absent migrations: apply the missing
forward SQL patches in filename order, verify Supabase Data API exposure, then
reload. The service-role client needs `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SUPABASE_URL` set in Vercel's server environment.

**Why a passing Next.js build did not detect it:** the CI build uses placeholder
Supabase connection settings and does not execute these authenticated queries
against the owner's Campus Class database. A DB-level error code is now logged
server-side for diagnosis. Do not substitute an empty grade for a query failure.

## Syllabus PDF text extraction and pgvector retrieval (forward SQL 036)

After applying [036: syllabus pgvector index](../supabase/migrations/202611190036_syllabus_pgvector_index.sql),
open **Syllabus** as authorized faculty/admin. Each document has an
**Index / re-index PDF** action. It reads the **file-parser text annotations**
returned by OpenRouter, NOT a model-generated summary. You may opt into
**paid OCR** for scanned PDFs. Only the document's class-assigned faculty or a
college administrator may start indexing. Indexing is limited to 20 MB PDFs,
120,000 extracted characters and 96 chunks per PDF; documents beyond a limit
fail without replacing any previous index.

Only explicitly available PDF form-feed page breaks yield page numbers. The
index never guesses a page number from an ordinary paragraph. Other excerpts
are cited at the document level.

Extracted text is chunked and embedded through the college's private
OpenRouter Vault key using `openai/text-embedding-3-small` with 1536 dimensions.
Both provider calls and the existing chat assistant use the database-backed
AI quota. A service-only transactional RPC replaces the index after ALL
embeddings have succeeded. Deleting syllabus metadata cascades to its indexed
chunks; no raw vector data is accessible through student/anonymous API roles.

On a student Copilot request, the server first checks whether any indexed
syllabus from an enrolled class exists. If so, it embeds the query and
retrieves relevant same-college chunks using a service-only match function
that ALSO validates active student enrollment. Excerpts receive `[R1]`
style citations. Missing migration 036, no indexed content or an unavailable
embedding provider falls back to existing published text/outline assistance
rather than disclosing arbitrary document content or causing a page crash.

Run `supabase/tests/syllabus_rag_security.test.sql` only on disposable
staging database after applying migrations, and verify cross-college isolation
with two simulated colleges. No live Supabase migration or tenant fixture
security test has been executed by the assistant.

## Real browser acceptance suite (requires staging credentials)

A Playwright suite is available in `e2e/academic-pages.spec.ts` for
mobile Chromium and desktop Chromium, using the existing `pnpm test:e2e`.
Anonymous login/access tests run without credentials. Full authenticated tests
check all three previously crashing academic pages, the migration diagnostic
screen, viewport overflow and student role isolation.

On **a disposable staging deployment** (not your production data), configure
GitHub repository secrets `CAMPUSCLASS_E2E_ADMIN_EMAIL`,
`CAMPUSCLASS_E2E_ADMIN_PASSWORD`,
`CAMPUSCLASS_E2E_STUDENT_EMAIL`, and
`CAMPUSCLASS_E2E_STUDENT_PASSWORD`.
Then dispatch the **CampusClass Staging Browser Acceptance** workflow with
the staging URL. Without credentials the authenticated tests correctly skip;
a green anonymous-only run is NOT academic production certification.
No authenticated live browser test has been performed against your Campus
Class production project.

## CI browser smoke checks

The regular GitHub CI now also boots a local Next.js development server and
runs anonymous-user login/route guards in both desktop Chromium and mobile
375px Chromium. This checks real browser layout and non-authenticated access,
not only HTML generated by the build.

These checks are **not a substitute** for authenticated cross-college staging
tests or a Vercel deployment test. Use the separate staging browser workflow
with explicitly configured test accounts for that coverage.
