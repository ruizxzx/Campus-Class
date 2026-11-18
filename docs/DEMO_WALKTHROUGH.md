# Fictional Campus Class 2.0 demo and acceptance walkthrough

Use this script only on an **isolated staging** project with fake identities. Do not create demo users or upload sample data in a real college or use real student records. This runbook describes actual application workflows; it is not an automated seed or a claim that tests have been run.

## Preparation

Create **College Alpha** and **College Beta** through the college admin registration flow, each with separate fake administrator, faculty and student users. Under Alpha, create a department, subject, a class, give the faculty assignment-management permission, enroll the fake student and configure the college AI model and OpenRouter key after Vault SQL 032. Use only self-owned test credits. Assign a different subject/class in Beta to verify isolation.

## Administrator demonstration

1. Sign in as Alpha admin, create/assign a faculty member and students, define a subject and class, and check invitations and enrollment.
2. Open Admin → AI settings, save an OpenRouter key; verify the UI reports configured. **Never display the secret itself.**
3. Open Student Success for the class and configure attendance and released quiz alert rules. Create/update the class's Gradebook weighting policy and verify the sum is exactly 100%.
4. Switch to Beta admin; confirm Alpha's courses, Student Success signals, grades, AI settings and question bank are inaccessible.

## Faculty demonstration

1. Open Learning Studio → Course. Add a chapter with two lessons, include notes/video links, preview, save as draft then publish. Visit Manage courses and edit/reorder a lecture. Confirm changes are atomic and old completion IDs remain.
2. Upload a PDF syllabus to Alpha's class. Use the resource assistant only for authorized class members; note that the on-demand model PDF parsing is not a durable page-embedded RAG pipeline.
3. Create a quiz with true/false and multiple-choice items; save a reusable item to the question bank. Publish an assessment, configure a duration and attempts, and confirm a published result is withheld until faculty release.
4. Open Attendance, create a QR session; validate expiration and duplicate check-in rejection.
5. Open Student Success → follow-up and make an action plan and follow-up date; resolve it with a written outcome note.
6. Map a released quiz/assignment into Course Outcomes; inspect observed attainment, target gap and report CSV.

## Student demonstration

1. Sign in as the fake enrolled Alpha student; inspect class stream and published course, mark a lesson complete, reload and confirm persisted progress.
2. Open a timed quiz, save a draft, reload, submit and later view only released marks in results/Gradebook.
3. Open Campus AI Study Copilot, ask a class question, select a PDF and ask a follow-up. Reload the page and confirm **private** history is restored after SQL 037, then clear history. Test a disabled/invalid provider and check the error is actionable without disclosing credentials.
4. Visit the mobile navigation drawer and verify it scrolls independently at 320/375px. Test PWA offline shell behavior; private marks must never be stored in an offline public cache.

## Analytics and deployment review

Use made-up data to illustrate the eight-week attendance/quiz trend, late-enrollment fairness, excused absences, class-level weighted score index, released-only outcomes and incomplete-evidence states. Confirm fictional values through database rows; never show hard-coded or fabricated production statistics.

### Evidence to collect

Record separate PASS/FAIL checks for SQL migrations, class authorization, API behavior, accessibility/mobile device layout, provider billing/error recovery, signed URLs, release timing and Vercel deployment. A real production release decision requires human review of these staging results. See [Testing](TESTING.md).
