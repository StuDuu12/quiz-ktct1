# Task 7 Report: Balanced Mock-Exam Generation

## Outcome

Implemented real server-persisted mock-exam creation with:

- exactly 40 published questions;
- quotient/remainder allocation across exactly six course chapters;
- deterministic chapter quota ordering, per-chapter selection, shortage
  backfill, final question order, and option order;
- no duplicate question selection;
- deterministic rejection when fewer than 40 eligible questions exist;
- a fixed 60-minute expiry calculated from the database clock;
- immutable question and option content snapshots that survive later source
  edits or archival.

The TypeScript `seededShuffle` is non-mutating and deterministic. The pure
`allocateExamQuestions` implementation uses the same quota, seeded chapter
ordering, per-chapter selection, and deterministic unused-question backfill
contract as the production SQL RPC.

## Ownership and configuration security

Migration `202607290007_balanced_mock_exams.sql` replaces the production
`start_attempt` implementation without changing its public signature.

- Attempt ownership always comes from `auth.uid()`.
- The RPC requires an active profile and a published course.
- A configured attempt must use an active `mock_exam` config belonging to that
  course.
- Mock exams cannot be chapter-scoped and the course must contain exactly six
  chapters.
- The RPC fixes mock-exam size and duration at 40 questions and 3,600 seconds,
  regardless of client input.
- The attempt UUID is generated in the database and used as the private
  deterministic selection/order seed.

The `startMockExam(userId, configId)` server action calls `requireViewer`,
rejects a caller-supplied owner that differs from the authenticated viewer,
validates the active config and published course, invokes the trusted RPC, and
returns the persisted learner snapshot rather than live source content.

## Snapshot secrecy and immutability

Learner-readable `attempt_questions.question_snapshot` rows contain question
content, difficulty, shuffled options, and source identity only. A database
trigger removes any `explanation` or option `is_correct` keys on mock-exam
insert/update, and the migration cleans older mock snapshots.

Original correctness and explanation are captured separately in
`attempt_question_secrets`:

- RLS is enabled;
- authenticated, anonymous, and public roles have no table privileges;
- no learner policy exists;
- a privileged insert trigger captures the secret at attempt creation;
- mock-exam answers are graded against this immutable secret rather than the
  current question bank.

This preserves grading and later review semantics even if an instructor edits
the source question, option content, explanation, or correct option after the
attempt starts. `database.types.ts` includes the protected table and unchanged
`start_attempt` RPC signature.

## TDD evidence

The initial allocation run failed because the exam modules did not exist. The
current SQL behavioral suite then failed against the old implementation with:

- chapter counts ranging from 3 to 10 instead of 6 to 7;
- a short chapter receiving zero questions instead of its two available
  questions;
- an active `practice` config being accepted as a configured attempt;
- learner snapshots exposing explanations.

A later immutable-secret test failed because
`attempt_question_secrets` did not yet exist. Each failure was observed before
the corresponding production implementation.

Focused behavioral coverage now includes:

- deterministic non-mutating shuffle;
- exact 40-question allocation;
- six-chapter balance;
- deterministic shortage backfill and uniqueness;
- rejection below 40 unique eligible questions;
- `auth.uid()` ownership and cross-user RLS isolation;
- active `mock_exam` / published-course validation;
- database-clock 60-minute expiry;
- learner snapshot explanation/correctness secrecy;
- protected secret-table access denial;
- snapshot reopening after source edits;
- grading against the original correct-option snapshot.

## Fresh verification

All commands were run after the final production change:

- focused tests: 7 test files passed, 41 tests passed;
- `npm test`: 17 test files passed, 95 tests passed;
- `npm run typecheck`: exit 0;
- `npm run lint`: exit 0;
- `npm run build`: exit 0.

The repository remains npm/package-lock based. No pnpm artifact was added.
