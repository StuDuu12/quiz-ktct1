# Task 9 report — immutable results and attempt history

## Delivered

- Added pure `gradeAttempt(snapshot, answers)` grading with explicit correct,
  incorrect, unanswered, and percentage totals.
- Added migration `202607290010_immutable_results_history.sql`.
  `attempt_question_secrets` captures both practice and mock-exam answer keys
  and explanations. Capture now begins in migration 004, at the same boundary
  where practice attempts become creatable, so no new practice row can exist
  before its immutable grading secret. The relation remains RLS protected with
  no learner grants or policies.
- Replaced practice grading and immediate feedback reads from mutable source
  questions with the protected attempt secret. Editing a source question,
  correct option, option content, or explanation no longer changes a captured
  practice result.
- Added the scoped `get_attempt_result_details` RPC. It authorizes the owner or
  an admin/instructor within existing course scope, refuses every non-submitted
  attempt, and returns the immutable question/options, user choice, correct
  option, explanation, flag, and unanswered state.
- Added the paginated `get_attempt_history` RPC. Student scope is always bound
  to `auth.uid()` regardless of a caller-supplied user ID. Staff access remains
  constrained by `can_manage_course`. It includes every attempt state and
  supports kind, chapter, date range, score band, and page filters.
- Added typed server queries and strict filter normalization for supported
  kinds, canonical UUIDs, ISO dates, score bands, and positive pages.
- Added `/history` with responsive filters, pagination, result links, explicit
  empty/error states, and text labels for submitted, active, and expired rows.
- Added `/results/[attemptId]` with an immutable summary and per-question
  review. Correct, incorrect, unanswered, and flagged states always include
  icons and text; success/danger/neutral colors are supplementary.
- Added responsive result/history styling, 44 px controls, visible focus
  states, and mobile layouts.
- Linked submitted practice and mock-exam completion screens directly to the
  persisted result detail. Existing idempotent manual and automatic submission
  actions are unchanged.
- Linked the dashboard history navigation and submitted recent attempts to the
  real history/result routes.

## TDD and security coverage

- Pure grading tests cover immutable keys, incorrect answers, omitted answers,
  unknown answer keys, and empty attempts.
- PGlite tests cover pre-submit result denial, other-user denial, direct secret
  denial, immutable practice and mock results after source edits, student
  `auth.uid()` binding, practice/mock/active history, every required filter,
  pagination, and assigned instructor scope.
- Filter tests cover valid normalization and rejection of malformed values.
- Component tests cover submitted result links, active/empty history states,
  user choice, immutable correct option, immutable explanation, flagged state,
  unanswered state, and icon-plus-text status semantics.
- Existing practice and mock-exam session tests now verify the clear result
  link on a submitted reload.

## Review fixes

- Added sequential migration regressions for a practice attempt created at the
  migration-004 boundary and for a genuinely pre-capture submitted row.
- A pre-capture row now uses the strongest recoverable key: a selected answer
  previously recorded as correct, otherwise the current source key. Its stored
  answer correctness and submitted score are reconciled to that one key.
  Historic explanations are recovered from `question_snapshot` when present;
  if an older snapshot lacks one, the original explanation is not recoverable
  and the migration uses the current source explanation.
- Practice and mock answer saves, plus the shared answer trigger, validate a
  selected option only against the immutable `attempt_questions.option_order`.
  A live option added later is rejected even when it belongs to the same source
  question.
- Source option content and correctness remain editable, while deleting or
  replacing any option ID referenced by an attempt snapshot is blocked. This
  preserves both selected and unselected snapshot identities.
- Added database regressions for edited snapshotted options, newly added live
  options, and deletion/ID replacement of unselected snapshotted options.

## Verification

- Sequential migration/security suite: 5 files, 41 tests passed.
- Full suite: 26 files, 151 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; build output includes `/history` and
  `/results/:attemptId`.
- `git diff --check`: passed; only repository Windows line-ending conversion
  notices were emitted.
