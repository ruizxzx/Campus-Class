# Campus Class API and security contract

All authenticated routes require a valid session and active `profiles` record. Trust the server's user ID and college rather than any browser-supplied `college_id`, `created_by`, role or row owner. Every privileged route checks the relevant class/subject permissions and returns structured JSON errors. The `SUPABASE_SERVICE_ROLE_KEY` must be server-only.

| Route | Methods | Authorized usage and contract |
|---|---|---|
| `/api/admin/ai-settings` | GET, PUT | Active college admin only; saves new OpenRouter secrets to Vault (SQL 032), never exposes plaintext |
| `/api/ai/study-assistant` | POST | Active student; retrieved academic context and selected authorized syllabus PDF, bounded conversation tokens, hourly quota |
| `/api/ai/study-history` | GET, DELETE | Active student; own persisted conversation (SQL 037), clear private history |
| `/api/ai/resource-assistant` | POST | Authorized college resource reader; short-lived PDF URL only after RLS metadata check |
| `/api/ai/summarize` | POST | Authorized resource reader; server-side AI provider call |
| `/api/ai/evaluate-submission` | POST | Authorized faculty; AI is non-authoritative draft feedback |
| `/api/courses/manage` | POST | Staff-only create/update/archive/publish; SQL 036 single transaction, staff subject permission, revision conflict |
| `/api/question-bank` | GET, POST | Staff subject-scope browse, create, owner-edit and archive; answer keys never sent to students |
| `/api/quizzes` | POST | Staff creates assessment and questions transactionally |
| `/api/quizzes/session` | POST | Student starts/saves/submits timed attempts with DB lifecycle guard |
| `/api/attendance` | Staff/student operations | QR setup, active-enrollment check-in and staff corrections; database wall-clock guards |
| `/api/gradebook/policy` | POST | College admin or faculty with assignment-management permission; exact-class weights sum to 100 |
| `/api/success/interventions` | POST | Staff creates/updates a verified student's support plan with an outcome note |
| `/api/success/rules` | POST | College admin only; explicit support indicator thresholds |
| `/api/outcomes` | POST | Staff creates/edits subject outcomes, links/unlinks assessments within permitted classes |
| `/api/syllabi` | Resource operations | Private college+class PDFs with ownership authorization and cleanup |
| `/api/cron/deadline-reminders` | Protected Cron | Requires `CRON_SECRET`; idempotent reminder delivery |
| `/api/assignments/*`, `/api/submissions/*` | Resource operations | Enrollment/assignment management checks and release-controlled evaluation |

These are implementation contracts, **not a substitute for reviewing each route**. For the exact schema, Zod validators and authorization checks see `app/api/`, `lib/http.ts`, `lib/validators.ts` and the migration SQL. No new application feature should be considered secure merely because it checks `role === "authenticated"`; class membership and college must also be checked.

## Security invariants to verify in staging

- [ ] Two fake colleges cannot read each other's profiles, classes, courses, submissions, question bank, AI chat history, Vault-backed AI settings or private PDFs through REST, Storage, or the UI.
- [ ] Student roles cannot mutate another student's academic record, read answer keys, use staff-only APIs or retrieve unpublished lessons.
- [ ] Service-only RPC functions have `REVOKE ... FROM PUBLIC, anon, authenticated` and a `GRANT ... TO service_role`. Their server routes independently verify user and college.
- [ ] Legacy AES encryption uses the **original**, not a regenerated, `OPENROUTER_ENCRYPTION_KEY`; new secrets must be re-saved into Vault after migration 032.
- [ ] Disabled college AI or exhausted hourly quota prevents provider requests before spending tokens.
- [ ] Timed assessment expiration, check-in replay, late submission and quiz release are enforced server-side and in Postgres.
- [ ] Database policies, Storage permissions, and signed URL expirations are exercised on a disposable, correctly migrated Supabase project.
- [ ] User-controlled comments, titles, file names and AI inputs are treated as data, never as system instructions or trusted tenant identifiers.
- [ ] CSV exports escape leading spreadsheet formulas and only include an authorized roster.
- [ ] AI history is private, persists only in the college+student scope, is idempotent by request UUID and can be cleared.

## Error handling

Permission failures return 403; absent resources 404; invalid body 400; stale course revision 409; provider/unavailable migration 503. When history persistence fails but model generation succeeds, the study endpoint **returns the answer with an explicit `history_saved: false` warning**, not a false success claim nor a dropped answer. Retry uses the same request ID where possible to avoid duplicate billing.

## Database and rollback

All new schemas are **forward-only** migrations. No production reset/truncate is authorized. To reverse a release, roll back the Vercel deployment, keep the added tables/data intact, then design a reviewed compensating SQL patch. Deleting course lessons, student progress or college API keys as a rollback is prohibited. See ordered migration references in [deployment guide](CAMPUSCLASS_2_0_COMPLETION.md).
