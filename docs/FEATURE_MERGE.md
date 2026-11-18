# Feature merge specification — CampusClass 1.1

## Source-derived feature inventory

### ScholaFlow (uploaded `scholaflow-main.zip`)
The inspected project documents and implements classroom lifecycle/enrollment, class stream categories (announcement, assignment, quiz, question, material), topic classification, pinned/scheduled/targeted posts, submission pipeline with attachment/link handling, grading and returned work, class chat, rich-text editing, personal notes, assignment to-do states, notifications, profile/user management, and role controls.

### LMS Front (`guillermoscript/lms-front`)
The repository README documents multi-tenant schools, institution theming, courses/lessons with block-editor content, exercises/checkpoints, exams, AI-assisted grading, learner progress, spaced repetition, certificates, XP/levels/streaks/achievements/challenges, community spaces/polls/moderation, and optional AI tutor/MCP tools. It also includes creator commerce, payments, subscriptions, invoices, payouts and storefront features.

## College adaptation decisions

| Reference capability | CampusClass adaptation |
| --- | --- |
| School/course tenancy | College workspace tenancy with database RLS |
| Course catalog | Courses are owned by college subjects/departments |
| Teacher classroom stream | Faculty-controlled class stream |
| Targeted publishing | Class posts can be targeted to class participants |
| Class chat | Chat scoped to a college class and its members |
| Classwork/exams | Assignment plus quiz/exam assessment workflow |
| Rubrics/feedback | Faculty evaluation and separate release visibility |
| Notes & to-do | Personal workspace tied to a college profile |
| Progress | Lesson completion linked to college course lessons |
| Gamification | Optional college-managed XP and achievement layer |
| Certificates | College-issued academic certificate records |
| Payments/storefront | Excluded from student academic flow; no course sales |
| AI Tutor | Future module; must use college/class permissions and RLS |
| Internationalization | Future UI work; database/text architecture does not assume a single locale |

## Important security boundary

A user can belong to a college through an authenticated profile. Every added data table carries `college_id` and relies on RLS. Class-scoped operations must additionally check active student enrollment, assigned faculty membership, or the college administrator role. A class or course ID by itself is never authorization.

`quiz_questions.answer_key` remains in the public schema with column-level access withheld from authenticated clients; student queries must never retrieve it. Quiz submission and faculty grading run through restricted server-side database functions. This is not a high-stakes exam certification: a private answer-key store and behavioral tenant-isolation tests are still required.

## Not complete / deliberately not claimed

- Stream edit/delete, topic authoring, scheduled publishing and realtime subscription wiring.
- Full course authoring, reordering, lesson material uploads and rich-text lesson editor.
- Durable quiz autosave/resume, server-enforced timed attempts, negative marking and anti-cheating safeguards.
- Scheduled post publishing worker.
- Certificate PDF generation, public verification API and revocation UI.
- Full achievement-awarding triggers and leaderboards.
- AI tutor/MCP service and institutional data governance.
- i18n locale bundles.
- Full end-to-end two-college tenant-isolation and private-storage suite for the new workflows.

These are recorded as follow-up tasks rather than represented as completed functionality.
