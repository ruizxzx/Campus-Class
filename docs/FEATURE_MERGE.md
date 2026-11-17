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

`quiz_questions.answer_key` is included in the initial schema to model authoring. Student query paths must never retrieve it. For a production exam, store answers in a private schema/table and grade submissions through a server-side operation. The current migration is a foundation and should not be considered a complete high-stakes examination implementation until that split and corresponding tests are in place.

## Not complete / deliberately not claimed

- Rich-text stream/lesson editor UI and image paste/upload.
- Realtime WebSocket subscription wiring for chat and stream.
- Quiz editor, timer, attempt controls, grading, anti-cheating safeguards and grade release.
- Scheduled post publishing worker.
- Certificate PDF generation, public verification API and revocation UI.
- Full achievement-awarding triggers and leaderboards.
- AI tutor/MCP service and institutional data governance.
- i18n locale bundles.
- Full end-to-end tenant-isolation suite for the new tables.

These are recorded as follow-up tasks rather than represented as completed functionality.
