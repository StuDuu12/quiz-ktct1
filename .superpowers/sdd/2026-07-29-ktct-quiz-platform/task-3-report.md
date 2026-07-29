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

## Deterministic database-security follow-up

- Reproduced with full `npm test`: the one-question shuffled exam chose the eligible `mutationQuestion`, while the test incorrectly required `assignedQuestion`.
- Replaced the ID/content assertion with relational invariants: the generated snapshot must have exactly one question, belong to the requested course, be published, preserve the selected question content, contain exactly the matching question-option set, and not expose `is_correct`.
- The existing direct-insert rejection, server-controlled 1800-second timing, and server-controlled question count assertions remain unchanged.
- `npm test -- tests/database-security.test.ts` passed three consecutive times (7/7 each).
- Fresh `npm test` passed 32/32; `npm run typecheck` and `npm run build` exited 0.

## Review fix I1 — callback open redirect

- RED: added `tests/auth-callback.test.ts`; `npm test -- tests/auth-callback.test.ts` failed because `next=/\\evil.example` produced `Location: https://evil.example/`.
- GREEN: the callback now rejects any backslash, parses destinations against the request origin, requires an exact origin match, and returns only `pathname + search + hash`.
- Regression coverage verifies rejection of an absolute external URL, `//evil.example`, and `/\\evil.example`, while preserving a same-origin relative path.
- Verification: focused callback tests passed 4/4; fresh `npm test` passed 36/36; `npm run typecheck`, `npm run lint`, and `npm run build` exited 0.
