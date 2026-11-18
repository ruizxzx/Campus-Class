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
3. Run [032: college AI Vault](../supabase/migrations/202611180032_college_ai_vault.sql)
   and [033: question bank](../supabase/migrations/202611180033_question_bank.sql)
   using the SQL Editor in that order. Neither SQL is run by ChatGPT.
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
  and table_name in ('question_bank_items','ai_request_usage');
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
  *filtered* academic signals. Signals are explainable rules, not diagnoses.
- **Gradebook:** paged assessment evidence; only released scores displayed,
  duplicate quiz attempts consolidated to the best released attempt;
  per-learner recorded score average and CSV. Missing scores remain unknown.
- **Outcomes:** only released latest-assignment evaluations and best
  released quiz marks contribute; faculty can edit targets, view linked
  evidence and unlink mappings, subject/class permissions re-checked.
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
  release timing, Gradebook averages and mapping denominators.
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
