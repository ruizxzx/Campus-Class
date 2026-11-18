# Build 1.3

## Added

- Faculty Learning Studio for stream, course, lesson, and assessment publishing.
- Automatic notifications for published stream posts and new comments.
- Build 1.3 verification notes and migration coverage.

## Security

- Authoring writes continue through Supabase RLS and authenticated faculty/admin policies.
- Notification triggers run server-side and scope recipients by college, active enrollment, and post ownership.
- Existing answer-key, quiz-attempt, course visibility, and lesson-progress protections remain unchanged.
