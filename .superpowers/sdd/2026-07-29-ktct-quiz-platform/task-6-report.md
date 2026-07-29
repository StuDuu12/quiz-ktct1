# Task 6 Report: Chapter Practice Sessions

## Outcome

Implemented secure, server-persisted chapter practice sessions with:

- one question visible at a time;
- keyboard answers using `1`–`4`, arrow-key navigation, and `F` flagging;
- first-answer locking with immediate correct/incorrect feedback and explanation;
- persistent answered and flagged state;
- a complete sticky right-side question navigator on desktop;
- a fixed launcher and bottom-sheet navigator on mobile;
- explicit review and confirmation before completion;
- both `/courses/[courseSlug]/chapters/[position]/practice` and
  `/practice/[chapterId]` routes.

The existing course dashboard link is now live. The course route resolves the
chapter identity, starts a real chapter-scoped attempt, and keeps the route
stable with the created attempt ID.

## Persistence and security

Added migration `202607290004_practice_sessions.sql`.

- Extended the existing `start_attempt` lifecycle with an optional
  chapter scope while preserving the two-argument mock-exam call.
- Added `attempt_answers.is_flagged`; authenticated clients can select only
  this non-secret column in addition to the previously allowed answer fields.
- Added `save_practice_answer`, a `SECURITY DEFINER` RPC that:
  - requires `auth.uid()` ownership;
  - requires `kind = practice`;
  - requires `status = in_progress` and a non-expired attempt;
  - requires the exact attempt-question and an option belonging to it;
  - accepts the first answer atomically and rejects changes with
    `ANSWER_LOCKED`;
  - returns correctness and explanation only for that exact saved option.
- Added a trigger that prevents changing or deleting a submitted practice
  answer even through direct table operations.
- Added ownership-scoped `set_practice_flag` and
  `finish_practice_attempt` RPCs.
- Application queries never select `question_options.is_correct` or
  `attempt_answers.is_correct`. The latter is read only inside the exact-answer
  feedback RPC.

## TDD evidence

The initial focused run failed for the expected missing production artifacts:

- missing `src/features/practice/engine`;
- missing `PracticeSession`;
- missing `202607290004_practice_sessions.sql`.

Red/green coverage now includes:

- immutable first-answer locking and server feedback merging;
- invalid option rejection and independent flag toggling;
- keyboard submission and locked controls;
- complete navigator state and F-key persistence;
- review confirmation before completion;
- chapter-only attempt snapshots;
- feedback isolation, non-enumerability, ownership, flags, and completion;
- clean migration application and compatibility with the existing database
  security suite.

## Fresh verification

All commands were run after the final production change:

- `npm test`: 14 test files passed, 72 tests passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; both practice routes were detected.

The repository remains npm/package-lock based. No pnpm lock or workspace file
is included.
