# Task 8 — Production release report

Date: 2026-07-30 (Asia/Saigon)

## Release

- Production URL: https://ktct-luyen-thi-mac-lenin-2026.ktct-chuquangduy.workers.dev
- Final Worker version prefix: `5962c870`.
- Traffic: 100% on the final version.
- Required encrypted binding: `SUPABASE_SERVICE_ROLE_KEY` (`secret_text`), verified after the final deploy. No secret value was printed, uploaded again, or committed.
- Release commits:
  - `c1ee9fe` — avoid parallel authenticated route-prefetch bursts.
  - `b728908` — inline SSR route modules for the Workers Free CPU budget.
  - `7c0a6fb` — generate the required Worker secret contract from committed source.

## Quality gates

- Unit/integration: 51 files, 292 tests passed.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Playwright E2E: 21/21 passed, including 375, 768, 1024, and 1440 px.
- `git diff --check`: passed.

## Database release

Applied to the production Supabase project:

1. `202607300001_admin_role_management.sql`
2. `202607300002_harden_admin_access_changes.sql`
3. `202607300003_resume_practice_attempt.sql`

Verified RPCs:

- `admin_set_user_role(uuid, app_role)`
- `lock_admin_access_changes()`
- `start_or_resume_practice(uuid, uuid)`

The project did not already contain `supabase_migrations.schema_migrations`; the migrations were applied and verified through the authenticated SQL Editor without fabricating migration-history rows.

Production data after setup:

- 1 course
- 6 chapters
- 497 questions
- 1,988 published options
- exactly 1 active mock-exam configuration
- mock exam: 40 questions, 3,600 seconds
- 492 pre-existing attempts preserved

## Authenticated role smoke

Disposable, auto-confirmed users were created for student, instructor, and administrator checks. Role assignment was limited to their exact UUIDs. The privileged-profile trigger was disabled and re-enabled inside the same transaction.

- Student:
  - `/dashboard` loaded the isolated learner portal.
  - `/admin` redirected to `/dashboard?access=denied`.
  - One 49-question practice attempt was started and resumed without duplication.
  - One 40-question, 60-minute mock exam started with a 40-question navigator.
  - `/history` persisted both in-progress attempts.
- Instructor:
  - `/instructor` loaded the isolated instructor shell.
  - `/admin` redirected to `/instructor?access=denied`.
  - Courses, questions, Markdown import, and reports loaded with real assigned-course data.
- Administrator:
  - `/admin` loaded the isolated administrator shell.
  - Users, questions, Markdown import, reports, and courses were reachable.
  - `/instructor` redirected to `/admin?access=denied`.

The login API returned OK and issued a usable session. A browser-automation-only client transition left the visible URL at `/login`; direct navigation immediately used the issued cookie and loaded the correct role portal. Worker logs contained no auth exception.

## Workers Free CPU incident and fix

Initial authenticated cold requests produced Cloudflare Error 1102. Worker tail showed `Exceeded CPU Limit`, while retries on a warmed isolate passed. The original SSR build lazily imported route-component chunks during the request, and portal navigation also prefetched several authenticated routes together.

Fixes:

1. Disabled Next.js prefetch on administrator and instructor navigation links.
2. Set SSR `codeSplitting: false` so route modules are compiled with the isolate rather than lazily during the first request.

Bundle evidence:

- SSR route assets collapsed into one `ssr/index.js` (about 1.83 MiB).
- Route-component dynamic imports were removed.
- Worker upload used 6 modules instead of the prior 38-module release.

Cold-version verification used three successive deployments of the identical final bundle:

- `0dd07832…` → `/admin/questions`: passed, no 1102.
- `0f299f04…` → `/admin/import`: passed, no 1102.
- `d68b9ee4…` → `/instructor/reports`: passed, no 1102.

Final cold-probe result: 0/3 Error 1102.

Relevant Cloudflare documentation:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/

## Responsive and typography smoke

- Landing page: 375, 768, 1024, and 1440 px; no horizontal overflow; `Be Vietnam Pro` active.
- Instructor portal: 375, 768, 1024, and 1440 px; no horizontal overflow; navigation and H1 present; `Be Vietnam Pro` active.
- Student portal: 375 and 1440 px; no horizontal overflow; mock-exam CTA present; `Be Vietnam Pro` active.
- Administrator portal: 375 and 1440 px; no horizontal overflow; administration navigation present; `Be Vietnam Pro` active.
- Automated E2E additionally covered all release surfaces at 375, 768, 1024, and 1440 px.

QA screenshots:

- [Administrator portal at 375 viewport](../../../artifacts/release-audit/2026-07-30/production-admin-375.png)
- [375 viewport loaded-state metadata](../../../artifacts/release-audit/2026-07-30/production-admin-375.metadata.json)
- [Administrator portal at 1440 viewport](../../../artifacts/release-audit/2026-07-30/production-admin-1440.png)

Durable release evidence:

- [Evidence index](../../../artifacts/release-audit/2026-07-30/README.md)
- [Cold HTTP/tail/version probes](../../../artifacts/release-audit/2026-07-30/cold-probes.json)
- [Sanitized deployment and secret-name transcript](../../../artifacts/release-audit/2026-07-30/deployment-secret-evidence.txt)
- [Database verification and cleanup invariants](../../../artifacts/release-audit/2026-07-30/database-verification.json)

## Cleanup and final invariants

Only the exact disposable UUIDs and two smoke-attempt UUIDs were removed. The two attempt-content guard triggers were disabled only for the cleanup transaction and re-enabled before commit.

Authoritative final SQL result:

- `attempts_total = 492`
- `smoke_profiles = 0`
- `smoke_auth_users = 0`

The temporary `.release-public-env.json` file was securely removed and was never committed. The working tree was clean after the release commits.
