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

Added migrations `202607290004_practice_sessions.sql`,
`202607290005_harden_practice_sessions.sql`, and
`202607290006_preserve_practice_snapshot_scope.sql`.

- Extended the existing `start_attempt` lifecycle with an optional
  chapter scope while preserving the two-argument mock-exam call.
- Added `attempt_answers.is_flagged`; authenticated clients can select only
  this non-secret column in addition to the previously allowed answer fields.
- Added `save_practice_answer`, a `SECURITY DEFINER` RPC that:
  - requires `auth.uid()` ownership;
  - requires `kind = practice`;
  - requires `status = in_progress` and a non-expired attempt;
  - requires the exact attempt-question and an option belonging to it;
  - accepts the first answer atomically;
  - reconciles later or racing requests to the authoritative saved option;
  - returns correctness and explanation only for that exact saved answer.
- Added a trigger that prevents changing or deleting a submitted practice
  answer even through direct table operations.
- Added ownership-scoped `set_practice_flag` and
  `finish_practice_attempt` RPCs.
- Application queries never select `question_options.is_correct` or
  `attempt_answers.is_correct`. The latter is read only inside the exact-answer
  feedback RPC.
- Practice snapshots are stripped of explanations by a database trigger, and
  existing practice snapshots are cleaned by the hardening migration.
- Authenticated table access to `questions` is column-scoped and excludes
  `explanation`; explanations are available only through the exact-answer RPC.
- `sync_practice_attempt` uses the database clock to persist and return an
  expired state during reload. Finishing after the deadline likewise persists
  and returns `expired`.
- Practice snapshots carry a trusted immutable `chapter_id`. Existing
  snapshots are backfilled, and an owner-checked loader validates the requested
  chapter from this metadata without consulting current question visibility.

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

## Review fix round 1

The review findings for commit `6670349df86a166c584f7ab45d039360fb3467df`
were addressed with focused red/green tests:

- learner-readable snapshots and direct authenticated question reads cannot
  expose explanations;
- reload and finish both use server-authoritative expiry and persist
  `expired`;
- a losing cross-tab answer reconciles its optimistic choice and feedback to
  the first saved answer;
- the review modal transfers and traps focus, closes on Escape, makes the
  background inert, and restores focus to its invoker;
- keyboard shortcuts are ignored inside inputs, textareas, selects, and
  content-editable regions.

The initial focused run failed at each missing behavior. The focused database,
engine, and component suites all passed after implementation.

## Review fix round 2

The remaining I4 finding was addressed with a focused database integration
test. Its initial red run failed because the owner-checked immutable snapshot
loader did not exist. The completed test:

- creates an attempt before migration 006 and verifies its chapter scope is
  backfilled;
- starts a new attempt, archives its source question, and verifies the owner can
  reopen the saved snapshot;
- rejects the same attempt when a different chapter is requested;
- confirms the continued snapshot still contains no explanation.

`loadPracticeSession` now uses the owner-checked snapshot loader and no longer
queries learner-visible current question rows during continuation.

## Fresh verification

All commands were run after the final production change:

- `npm test`: 14 test files passed, 82 tests passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; both practice routes were detected.

The repository remains npm/package-lock based. No pnpm lock or workspace file
is included.
