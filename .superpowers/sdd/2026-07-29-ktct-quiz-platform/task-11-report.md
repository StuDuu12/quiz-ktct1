# Task 11 report — end-to-end verification and accessibility audit

## Outcome

Implemented a Chromium Playwright suite against the real application routes and
components. The suite covers:

- registration, explicit email confirmation, sign-in, and session restoration
  after reload;
- practice answer persistence, immediate feedback, flag persistence after
  reload, and the mobile navigator dialog;
- mock-exam review before submit, authoritative answer counts, manual submit,
  server-forced expiry, and automatic submit;
- student denial from the admin surface and instructor course scoping;
- native radio inputs, visible keyboard focus, modal focus return/Escape,
  reduced motion, 44px answer targets, the below-768px bottom-sheet breakpoint,
  and no horizontal overflow at 375px, 768px, and 1280px;
- a non-live visual countdown plus a visually hidden polite warning region
  which announces the 10-minute, 5-minute, 1-minute, and expiry thresholds once
  each, including when the browser clock jumps after backgrounding;
- real-session browser checks proving 1–4, F, and arrow shortcuts do not answer,
  flag, or navigate while the E2E-only editable probe has focus.

## Test-only persistence boundary

No production persistence was faked. The deterministic in-memory fixture store
is reachable only when both `E2E_MODE=1` and `E2E_TEST_SERVER=1` are present and
`NODE_ENV` is not `production`. Vite injects those flags only for a development
serve command started with E2E mode; build output receives disabled constants.

Defense in depth:

- every fixture-store action asserts the guard itself;
- every fixture HTTP endpoint checks the guard and returns 404 when disabled;
- unit coverage enumerates all 22 exported fixture actions and all five fixture
  HTTP endpoints, proving they fail closed in production even if both flags are
  manually set;
- the production build was run with all E2E environment variables explicitly
  removed.

The route modules remain present in the production route manifest, but return
404 and cannot access the fixture store.

## TDD evidence

Representative RED states observed before implementation:

- auth failed because the fixture reset/auth routes did not exist;
- practice failed because option controls were not native radios and the mobile
  navigator was not an accessible dialog;
- mock exam failed because its options used styled `role="radio"` buttons;
- student admin navigation initially exposed the admin layout;
- a repeated E2E run caught a pre-hydration server-action click, leading to a
  client-owned launch form whose readiness marker covers the action itself
  instead of a fixed delay;
- production-boundary tests drove store-level assertions and 404 endpoint
  behavior;
- the timer regression test first failed on `aria-live="polite"` on the visual
  countdown, then drove threshold-only announcements;
- practice and mock editable-shortcut E2E tests first failed because the gated
  real-session textbox did not exist, then passed with all shortcut effects
  unchanged while typed text remained.

The fix-round targeted component suite passed 24/24 tests and the two new
editable-shortcut Playwright regressions passed before the full gate.

## Verification

All commands were run from the task worktree:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 32 files passed, 180 tests passed.
- production build with `E2E_MODE`, `E2E_TEST_SERVER`, and
  `NEXT_PUBLIC_E2E_MODE` removed — passed (`vinext build`, five environments).
- `npm run test:e2e` — 10 Playwright tests passed in Chromium.
- `git diff --check` — passed (only Git line-ending notices).

## Limitations

- A local Supabase stack, Docker daemon, and project credentials were not
  available. Persistence assertions therefore use the isolated E2E-only server
  fixture rather than a real Supabase instance.
- Browser coverage is Chromium only. The flows are semantic and responsive,
  but Firefox/WebKit engine-specific behavior was not exercised.
