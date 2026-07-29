# Task 8 report — resilient timed mock-exam experience

## Delivered

- Added a server-derived exam clock using persisted `expires_at` plus database
  `server_now`; reloads recalculate the remaining time instead of resetting it.
- Added migration `202607290008_resilient_mock_exam_sessions.sql` with narrow
  security-definer RPCs for answer changes, flags, synchronized reloads, and
  idempotent submission.
- Revoked direct authenticated writes to `attempts` and `attempt_answers`.
  Exam mutations now verify `auth.uid()`, `mock_exam`, `in_progress`, and an
  unexpired server deadline while holding the attempt row lock.
- Kept mock-exam grading bound to `attempt_question_secrets`. Tests change the
  source question's current correct option and still receive the score from the
  immutable secret snapshot.
- Made expiry submit saved work through the same canonical submit RPC. Reloading
  after the deadline synchronizes to `submitted`; repeated submit calls return
  the same stored result.
- Added the authenticated `/exam/[attemptId]` session route and a secure
  `/courses/[courseSlug]/mock-exam` launch route that resolves the latest active
  mock-exam config before creating and redirecting to the owned attempt.
- Added the exam UI with one question at a time, keys 1–4, `F`, arrow keys,
  previous/next controls, optimistic autosave with authoritative reconciliation,
  explicit network-error/retry states, and submitted reload handling.
- Added a sticky all-40 desktop navigator and an all-40 mobile bottom sheet.
  Current, answered, unanswered, and flagged states have text labels and
  accessible names without pre-submit correctness leakage.
- Added a full-answer review dialog. It lists every question and selected option
  (or explicitly says unanswered), shows answered/unanswered/flagged counts,
  supports returning to a selected question, and requires final confirmation.
- Reused the Task 6 modal behavior: focus moves inside, Tab is trapped, Escape
  closes, the background is inert, and focus returns to the invoker.
- Added exam-specific responsive teal/apricot styling, 44 px targets, visible
  focus states, timer warnings, and reduced-motion support.

## TDD and security coverage

- Timer tests cover reload arithmetic, expiry clamping, the last partial second,
  and invalid deadlines.
- Review tests cover complete answer enumeration, unanswered entries, snapshot
  validation, and absence of correctness/explanations.
- Database tests cover owner-only mutation, answer changes, flag persistence,
  wrong-owner denial, direct-DML denial, post-deadline denial, expiry-on-reload
  submission, idempotent repeat submission, row-lock-safe state transitions,
  and immutable-secret scoring.
- Action tests cover exact guarded RPC boundaries, persisted session loading,
  canonical save results, repeated submit results, and honest network failures.
- Component tests cover all-40 navigation, one-question rendering, shortcuts,
  optimistic reconciliation, save retry, all-40 review content, modal behavior,
  auto-submit at zero, and submitted reloads.

## Verification

- Focused exam suite: 41 tests passed.
- Full suite: 21 files, 123 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; build output includes
  `/courses/:courseSlug/mock-exam` and `/exam/:attemptId`.

## Review hardening

- Added a server-only answer revision for every mock-exam attempt. Answer and
  flag RPCs serialize on the attempt row and advance the revision; the
  authoritative review RPC returns all 40 saved states bound to one revision.
- Manual submission now requires that reviewed revision. A write from another
  tab produces `REVIEW_STALE`; the client reloads the authoritative review and
  requires a second explicit confirmation. The deadline-only overload remains
  idempotent for automatic submission and synchronized reloads.
- Serialized all same-tab answer and flag writes through one client queue.
  Regression tests hold the first request open and prove that a later answer or
  flag RPC is not issued until it resolves.
- Replaced interval-decrement timing with absolute recomputation from the
  server-derived clock on each tick, window focus, and visibility change.
- Promoted the mobile question navigator to a true modal: initial focus, Tab
  wrapping, Escape close, inert exam background, and focus restoration now use
  the same shared focus behavior as the review dialog.
- Kept the revision relation hidden from authenticated learners; the security
  suite verifies that it cannot be selected directly.

## Review-fix verification

- Focused exam suite: 7 files, 51 tests passed.
- Full suite: 21 files, 133 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed (only the repository's Windows line-ending
  conversion notices were emitted).
