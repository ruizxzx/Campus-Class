# Campus Class — pre-presentation hardening rollout (20 Nov 2026)

Source: branch `fix/prepresentation-hardening-20261120`; see PR #10. These changes target audit CC-01, CC-02, CC-03, CC-07, CC-10 and optional account-setup email (CC-11). They do **not** certify production RLS or all user journeys.

## Database migrations — operator action required

These patches must be applied on the **Campus Class Supabase project** in order. GitHub/Vercel deployments **do not** execute them. The available Supabase connection currently shows only TABLELY and SELLORA; never apply Campus Class SQL there.

1. Ensure older SQL migrations through `202611190048_youtube_course_publish_service_grants.sql` are applied.
2. Apply `supabase/migrations/202611200049_youtube_certificate_watch_integrity.sql`. This modifies future course certificate issuance so *every published imported video* needs completed tracked playback at the configured threshold, even if a manual lesson_progress row already exists.
3. Apply `supabase/migrations/202611200050_atomic_library_publication.sql` to allow multi-document publishing through a role-checked, transactional RPC. Until SQL 050 is installed, **single-document uploads still work** but multi-document finalization intentionally fails closed rather than leaking partial batches.
4. Review legacy certificates issued before SQL 049; the migration deliberately does **not** silently revoke student credentials. Use the read-only audit query at the bottom of SQL 049, then review suspected invalid awards individually.

Test on staging and take a backup before applying any production patch.

## Required acceptance checks

- **Imported YouTube:** An enrolled student posting a known imported lesson ID directly to `/api/lessons/complete` gets HTTP 409. Ordinary non-YouTube lessons can still complete. A new certificate is withheld without sufficient watched coverage and released only after verified viewing and any configured assessments/approval. Verify awarded certificate is unique across retry and refresh.
- **Library:** Batch 3 valid PDFs uploads and finalizes together. A deliberately missing third file produces an error without publishing the first two. A retry with all files succeeds; an unauthorised faculty or student call fails.
- **Syllabus:** A 3-file batch with one invalid/missing PDF inserts no new metadata. A valid batch inserts all three; repeated finalization is idempotent.
- **Notifications:** New in-app notification appears in an already-open inbox and updates the global unread bell; read changes propagate. If Realtime isn't configured, 20-second polling refreshes both. RLS still needs a second-user/second-college test.
- **Certificates:** `/verify/CC-...` and `/api/certificates/verify?number=CC-...` show the issuing college, course, date and status, not student identities or grades. A revoked certificate shows invalid.
- **Member setup mail:** Admin can opt in to send a password-setup email after creating a member, using Supabase Auth's SMTP. If email delivery fails the account is still created and the admin receives a warning. Verify actual delivery to a test inbox.

## Not complete or not production-certified

- Production Campus Class migration state, RLS isolation, full authenticated browser E2E, cron delivery and real SMTP are **not verified** without the correct database connection and isolated test accounts.
- Gradebook/outcomes scale limits still require paginated aggregation for unusually large classes.
- Office DOCX/PPTX extraction is not implemented; only PDF/TXT indexing is supported. Scanned PDFs may require paid OCR. Do not market every file as AI-searchable.
- English/Hindi/Bengali localization covers common labels, not all screen text.
- Student Success uses transparent heuristic rules rather than a clinically or academically validated predictive ML model.
- Native generated PDF is not supplied; use browser Print/Save PDF on the certificate detail page. The public certificate verification service is independent.

## Minimal pre-demo smoke path

1. Admin: sign in → academic diagnostics → class/student/faculty setup.
2. Faculty: publish one assignment → student submits → faculty grades privately and releases → student sees results.
3. Admin: open Gradebook and Outcomes.
4. Faculty: upload *one* private PDF, verify student access and unauthorized denial.
5. Only show playlist imports and certificates after SQL 048–050 and watch progress are verified live.

CI validates code and anonymous browser behavior, not this authenticated checklist.
