# Task 12 production-preparation report

Date: 29 July 2026

## Completed production preparation

- Added `.env.example` with variable names and empty values only.
- Added environment validation that rejects missing, malformed, non-HTTPS, or
  non-origin production URLs without printing credential values.
- Wired site title, description, `metadataBase`, Open Graph, and X metadata to
  `NEXT_PUBLIC_SITE_URL`. Absolute `/og.png` URLs are emitted only when a valid
  production origin is configured; no fake production origin is embedded.
- Preserved the finalized `public/og.png` and verified its dimensions as
  `1200x630`. No additional image generation was performed.
- Preserved `.openai/hosting.json` unchanged; no Sites project ID, Supabase
  project reference, or other invented identifier was added.
- Added migration-order and seed-shape preflight checks.
- Added migration `202607290012_production_bootstrap.sql` for a
  service-role-only, idempotent first-administrator bootstrap. It also removes
  the incompatible `(chapter_id, source_number)` uniqueness index because the
  approved 497-question seed intentionally contains repeated source numbering
  in Chapter 6.
- Added one-time administrator creation, deterministic KTCT seeding, and exact
  database verification scripts. The scripts fail closed without environment
  values, do not log secrets, stop on unexpected existing data, and verify
  `courses=1`, `chapters=6`, `questions=497`, and
  `published_question_options=1988`.
- Added live smoke checks for public authentication routes, the Auth callback,
  signed-out student routes, and the signed-out admin route.
- Added npm scripts: `production:preflight`, `production:setup`,
  `production:verify`, and `production:smoke`.
- Added `docs/production-runbook.md` with the migration, setup, redirect,
  deployment, and authenticated smoke-test sequence.

## External steps not completed

The following require real credentials or external provider state and remain
blocked for the deployment owner:

- No Supabase project was created, linked, or selected.
- No production Supabase credentials were supplied or stored.
- No migration was applied to a remote database.
- No initial production administrator was created.
- `seed/ktct.json` was not imported into a remote database.
- The remote counts `1/6/497/1988` were not claimed as verified.
- Supabase Site URL, allowed redirect URLs, and email-confirmation settings
  were not changed or claimed complete.
- No Sites project was created, saved, or deployed. The once-only `create_site`
  action remains with the root task after review.
- No deployed URL exists yet, so live unauthenticated and authenticated
  production smoke checks were not run.

## Local verification evidence

- `npm test`: passed 34 files and 190 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings.
- `npm run build`: passed and emitted the full application route manifest.
- Production-preparation tests: passed 10 tests covering fail-closed runtime
  configuration, names-only environment template, migration order, exact seed
  counts, route coverage, and absolute social metadata.
- `npm run production:preflight` without variables: exited non-zero and named
  only the missing variables.
- `npm run production:preflight` with non-secret test values: verified 12
  migrations, `1/6/497/1988`, and `1200x630`.
- `npm run test:e2e` was inconclusive as a single harness invocation in this
  environment: it discovered 10 tests, passed the first, then exited code zero
  without Playwright's final summary. To avoid claiming that incomplete output,
  the existing E2E server was started once and all 10 Playwright scenarios were
  run individually by file and line. Each scenario reported `1 passed`,
  including registration/session restoration, practice feedback and reload,
  mock review/submission and expiry, responsive navigators, keyboard safety,
  student admin denial, and instructor course scope.

Remote Supabase verification and deployed production smoke checks remain
unrun, as listed under external steps.
