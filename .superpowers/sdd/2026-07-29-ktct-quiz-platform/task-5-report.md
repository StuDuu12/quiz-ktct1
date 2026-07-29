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

## Fix round 1

- Replaced the dashboard's prohibited nested read of `attempt_answers.is_correct` with `get_submitted_practice_progress(uuid)`, a submitted-only, authenticated, security-definer RPC. The underlying correctness column remains unavailable under the authenticated table grant.
- Added a PGlite authenticated-RLS test proving a learner cannot select correctness directly but can receive only the submitted practice aggregate through the RPC.
- Reflowed the labelled chapter accuracy and latest-attempt values into a compact details grid at tablet and mobile widths; they are no longer removed from the accessibility tree. Added a regression assertion for these labels and CSS behavior.

### Fix verification

- Focused: `npm run test -- tests/database-security.test.ts tests/dashboard-responsive.test.ts tests/progress.test.ts` — 10 passed
- Full: `npm run test` — 60 passed
- `npm run typecheck`, `npm run lint`, `npm run build` — passed
