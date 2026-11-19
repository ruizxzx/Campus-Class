# Campus Class 2.0 — Learning Progress, Certificates, Digital Library
Updated: 19 November 2026

## Forward SQL to apply manually
Run in the **correct Campus Class production Supabase SQL Editor** in this exact order, after earlier migrations 001–039:
1. `supabase/migrations/202611190040_lesson_progress_certificates.sql` — trusted progress writes; automatic course certificate trigger; faculty progress read.
2. `supabase/migrations/202611190041_study_materials_library.sql` — tenant-scoped library materials, immutable file versions, reading progress, bookmarks, full-text chunks and private Storage bucket.
3. `supabase/migrations/202611190042_study_material_text_indexing.sql` — transactionally replaces verified document text and searchable passages.

**Do not run these migrations in unrelated Supabase projects.** They add schema and functions without dropping existing learning data. SQL 040 backfills certificates for qualifying *existing* progress records; inspect production data and back up first. SQL 040 retains legacy duplicate certificates and issues a warning if its active-certificate unique index cannot be created.

## Faculty and admin
- `/faculty/learning?tab=stream` now uploads up to 10 PDF, DOCX, PPTX or image files (30 MB each) via direct signed Storage upload, then publishes the complete post.
- `/syllabus` now uploads up to 10 PDFs (20 MB each) via direct signed Storage upload and indexed study assistance.
- `/library`: create a collection of up to 10 materials per upload, choose class/semester/unit/chapter, replace documents, inspect download history, restore old versions, and index PDF/TXT text for search and AI.
- `/faculty/progress`: view course completion totals **and per-lecture completion marks per student** for subjects taught in assigned classes (admins across college).
- AI indexing uses the college's configured OpenRouter model and may incur costs. Real PDF parser annotations are required; scanned PDFs may require the explicit paid OCR option. Overlength or unsupported document types fail closed rather than inventing extracted text.

## Student
- `/courses/[courseId]`: mark a published lecture complete. The server validates college, class enrollment, course status and lecture. The database issues a certificate when the final published lecture is completed. Repeated attempts do not award XP twice.
- `/certificates`: see auto-issued college branded certificate; use a browser print/save-as-PDF option.
- `/library`: search titles and indexed PDF/TXT passages, preview PDFs in-browser, download documents, save last reading page, completion and bookmarks, and generate source-grounded summaries, flashcards and practice quizzes.

## Live acceptance checklist
1. Confirm production migration 040 has service-role SELECT/INSERT for `lesson_progress`, automatic trigger, correct class roster, and progress/XP/certificate idempotency.
2. Create a course with two published lectures; sign in as student A actively enrolled in its subject. Complete lecture 1 and refresh: 1/2. Complete lecture 2: 2/2 and one course certificate. Repeat requests: still one certificate and one XP award per lecture. Student B not enrolled should get 403. Faculty sees student A completion and no access to other subjects.
3. Upload 3 resources concurrently through stream; verify every file uploaded before students see the post. Check selected-recipient visibility. Test invalid type, failed upload, and retry.
4. Upload 2 PDFs to library for class A, index and search text from page 3. A student from class B / college B must not access metadata or signed file URLs. Test 30 MB upload, replacements, restore, version history and expired signed links.
5. Save student bookmark and reading page; open PDF in new session, ensure last page and bookmarks persist. Test generated AI summary, cards and quiz with OpenRouter configured and enabled.
6. Test scanned PDF OCR and unsupported DOCX/PPTX search messaging; those files remain available for download but are not falsely considered indexed PDF text.
7. Verify Vercel deployment READY for final commit and check logs for `42501`, `PGRST205`, Storage 403/413 and timeout errors.

## Scope and limits
- Full-text indexing/search applies to **extractable PDFs and TXT documents** after faculty indexing. DOCX/PPTX can be uploaded, versioned and downloaded; extracting their binary text is not implemented.
- PDF viewing uses the browser's built-in PDF renderer via an authorized private signed URL, not a custom annotation viewer. Page numbers in extracted annotations are shown only when the provider returned real page boundaries.
- Automatically generated quizzes are **ungraded practice**, not official exam results; generated flashcards and summaries require human review.
- Upload batches require each signed token to remain valid. If a tab is abandoned, unpublished drafts and unreferenced objects can remain and may need authorized cleanup.
- SQL migrations are operator-applied and do not execute automatically on GitHub push.
- CI and anonymous browser smoke tests cannot prove authenticated production Supabase RLS or verify actual notifications/AI service keys.

## Historical document safety
The student library's full-text results include only the material's **current version**. Historic versions remain accessible to authorized faculty for audit/restore, but superseded file text cannot appear in student search snippets.
