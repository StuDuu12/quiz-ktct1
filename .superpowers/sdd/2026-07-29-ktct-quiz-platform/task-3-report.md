# Task 3 report — Supabase auth, session and role guards

## Delivered

- Added lazy Supabase browser/server client factories using `@supabase/ssr` cookie adapters. Public environment validation only runs when a client is created, never at module import.
- Added `getViewer`, `requireViewer`, and `assertAllowedRole`. Viewer resolution uses `auth.getUser()` plus `profiles`; missing or inactive profiles are rejected.
- Added public student-only registration, login/logout browser actions, password reset request/update pages, verified-email feedback, and explicit invalid-credential/rate-limit/expired-reset feedback.
- Added secure `/auth/callback` code exchange with a same-origin relative redirect destination and protected-layout server guard.

## RED / GREEN evidence

1. RED: `npm test -- tests/session.test.ts`
   - Failed because `@/src/features/auth/session` did not exist.
2. GREEN: `npm test -- tests/session.test.ts`
   - Passed: 2 tests.
3. RED: expanded viewer tests, then ran `npm test -- tests/session.test.ts`.
   - Failed with `getViewer is not a function` and `requireViewer is not a function`.
4. GREEN: `npm test -- tests/session.test.ts; npm run typecheck`
   - Passed: 5 session tests; TypeScript exited 0.
5. RED: `npm test -- tests/browser-auth.test.ts`
   - Failed because `@/src/lib/supabase/browser` did not exist.
6. GREEN: `npm test -- tests/browser-auth.test.ts; npm run typecheck`
   - Passed: 2 action tests; TypeScript exited 0.
7. RED: added error-state tests, then ran `npm test -- tests/browser-auth.test.ts`.
   - Failed with `getAuthErrorMessage is not a function`; later the email-confirmation assertion failed with received `Email not confirmed`.
8. GREEN: `npm test -- tests/browser-auth.test.ts; npm run typecheck; npm run build`
   - Passed: 4 auth action/error tests; TypeScript exited 0; Vinext build exited 0.

## Verification

- Targeted auth/session suite: `npm test -- tests/session.test.ts tests/browser-auth.test.ts` — 9/9 passed.
- Type check: `npm run typecheck` — exited 0.
- Production build: `npm run build` — exited 0.
- Diff whitespace check: `git diff --check` / cached equivalent — clean.

## Commit

- `8d17bd3 feat: add secure account and session flows`

## Concern

The full `npm test` run remains non-deterministic in the pre-existing `tests/database-security.test.ts` test `starts attempts only through the trusted server function`. It expects the shuffled one-question exam to always choose `assignedQuestion`, but sometimes receives the also-published `mutationQuestion`. The database-security file passes repeatedly when run alone (`npm test -- tests/database-security.test.ts`), and the auth-specific tests, typecheck, and build all pass. No database or test files from that suite were changed for Task 3.
