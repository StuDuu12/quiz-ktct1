# Task 5 report — Learner course dashboard

## Delivered

- Added a server-side course dashboard query boundary backed by the authenticated Supabase client.
- Added submitted-practice-only chapter progress aggregation and its focused test.
- Added responsive Vietnamese learner dashboard and course route: course summary, six-chapter-ready list, question counts, accuracy, latest submitted attempt, mock-exam card, and recent-attempt history.
- Added honest empty, unavailable-course, and connection-error states. No fixture scores or fake persistence are rendered.

## Verification

- `npm run test -- tests/progress.test.ts` — passed (1 test)
- `npm run typecheck` — passed
- `npm run build` — passed

`pnpm` could not be used as a verifier in this worktree because its Corepack process repeatedly attempted to convert the npm-managed `node_modules` directory and did not complete; the orphaned conversion processes were stopped. Dependencies were restored with `npm install --ignore-scripts` and all project scripts above completed successfully.
