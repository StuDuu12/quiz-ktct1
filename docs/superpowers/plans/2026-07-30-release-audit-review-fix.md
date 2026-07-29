# Release Audit Review Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the required Worker secret reproducible from committed source and commit a durable, fully redacted production-release evidence bundle.

**Architecture:** The Cloudflare Vite plugin receives the required secret name through its committed source configuration, so Vinext's generated Wrangler file is deployable without post-build mutation. A standalone clean-build regression deletes `dist`, rebuilds with non-secret placeholders, and validates the generated config. Release evidence is stored under `artifacts/release-audit/2026-07-30` with screenshots and text/JSON summaries containing no credentials, emails, passwords, or UUIDs.

**Tech Stack:** TypeScript, Vite/Vinext, Cloudflare Vite plugin/Wrangler, Vitest, Playwright, PowerShell.

## Global Constraints

- Never commit or print a secret value.
- Preserve all existing production data; this review requires no database mutation.
- Deploy at most once, and only if the generated deployment output changes.
- Evidence artifacts must contain no email, password, secret, JWT, or UUID.

---

### Task 1: Clean-build secret regression

**Files:**
- Create: `scripts/production/verify-generated-wrangler.mjs`
- Modify: `package.json`
- Modify: `tests/production-config.test.ts`

**Interfaces:**
- Consumes: `npm run build` and `dist/server/wrangler.json`
- Produces: `npm run test:generated-config`, which exits nonzero unless `secrets.required` is exactly `["SUPABASE_SERVICE_ROLE_KEY"]`

- [ ] **Step 1: Write the failing verification script and source-contract test**

The script must resolve and delete only `<project>/dist`, execute a clean build with non-secret placeholder public values, parse the generated Wrangler JSON, and assert the exact required secret name.

- [ ] **Step 2: Run the targeted regression and verify RED**

Run: `npm run test:generated-config`

Expected: failure because the clean generated config currently lacks `secrets.required`.

- [ ] **Step 3: Add the required secret name to committed Cloudflare source config**

Add `secrets: { required: ["SUPABASE_SERVICE_ROLE_KEY"] }` to the `config` object passed to the Cloudflare Vite plugin. Do not add a value.

- [ ] **Step 4: Run the regression and verify GREEN**

Run: `npm run test:generated-config`

Expected: clean build succeeds and generated Wrangler config contains exactly the required secret name.

### Task 2: Durable redacted release audit

**Files:**
- Create: `artifacts/release-audit/2026-07-30/README.md`
- Create: `artifacts/release-audit/2026-07-30/production-admin-375.png`
- Create: `artifacts/release-audit/2026-07-30/production-admin-1440.png`
- Create: `artifacts/release-audit/2026-07-30/cold-probes.json`
- Create: `artifacts/release-audit/2026-07-30/deployment-secret-evidence.txt`
- Create: `artifacts/release-audit/2026-07-30/database-verification.json`
- Modify: `.superpowers/sdd/2026-07-30-three-role-portals-reliability/task-8-report.md`

**Interfaces:**
- Consumes: verified, already-observed production results
- Produces: committed, sanitized evidence with stable relative links from the task report

- [ ] **Step 1: Inspect screenshots and redact any private identifiers**

The committed images must not show email addresses, UUIDs, passwords, or secrets.

- [ ] **Step 2: Write structured text/JSON evidence**

Record only version prefixes/route names/statuses, secret binding name/type, deployment status, and aggregate database counts.

- [ ] **Step 3: Scan the evidence directory for sensitive patterns**

Fail on email addresses, JWTs, Supabase key prefixes, UUIDs, password-like fields, or service-role values.

- [ ] **Step 4: Update the task report with relative artifact links**

Every release-evidence claim must link to the corresponding committed artifact.

### Task 3: Release verification and handoff

**Files:**
- Modify: source/tests/artifacts from Tasks 1–2

**Interfaces:**
- Consumes: clean-build regression and release-audit bundle
- Produces: one reviewed release commit and, if required, one production deployment

- [ ] **Step 1: Run full gates**

Run unit tests, typecheck, lint, clean generated-config regression, production build, E2E, `git diff --check`, and sensitive-pattern scans.

- [ ] **Step 2: Deploy once only if generated output changed**

Deploy the clean generated Wrangler config without post-build edits, retain existing variables, and verify the existing secret binding by name/type.

- [ ] **Step 3: Commit and verify clean worktree**

Commit only source, tests, plan, report, and redacted evidence. Confirm the temporary build environment is absent and `git status --porcelain` is empty.
