# CampusClass 1.4 — Security and reliability patch

## Fixes
- Invitation acceptance: invalid tokens no longer fall back to email; tokenless acceptance requires a verified signed-in account; existing Auth users must prove their password instead of being located via admin.listUsers(); invitation claims are conditional.
- Notification retries: assignment and announcement notifications use existing (user_id, reference_key) unique constraint and conflict-ignore upserts.
- Auth redirects: reject external, protocol-relative, backslash and encoded slash URLs.
- Schedule delete validates UUIDs with Zod and schedule errors no longer expose PostgreSQL codes.

## Database changes
None. This release uses the existing notifications uniqueness constraint. No SQL migration is required for these changes.

## Validation
Six focused security regression tests passed locally in Node.js 22. Changed TypeScript files passed parser/transpilation checks. Full Next.js build, typecheck, lint and integration tests remain unverified because the execution environment cannot access the npm registry.

## Deployment limitations
The linked Supabase account exposes TABLELY and SELLORA, neither of which is CampusClass. No Supabase schema was changed. The full application, tenant isolation, and advanced learning features are not production-certified. Review existing BUILD_NOTES_1.3.md for unfinished features. Run complete CI and staging tests before deploying.
