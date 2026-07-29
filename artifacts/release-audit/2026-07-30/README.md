# Production release audit — 2026-07-30

This directory contains the durable, redacted evidence for the KTCT role-portal
production release.

## Evidence index

- [Administrator portal — 375 viewport](production-admin-375.png)
- [Administrator portal — 375 capture metadata](production-admin-375.metadata.json)
- [Administrator portal — 1440 viewport](production-admin-1440.png)
- [Cold-probe evidence](cold-probes.json)
- [Deployment and Worker secret evidence](deployment-secret-evidence.txt)
- [Database verification and cleanup evidence](database-verification.json)

The screenshots were captured during authenticated production smoke testing.
The 375 image is a page-only Playwright capture at an actual CSS viewport and
raster size of 375 × 812. It was taken after the administrator H1 loaded, with
the mobile header visible and drawer closed. The disposable identifier is
outside the viewport, so no redaction or geometry change was required. Exact
capture assertions are recorded in `production-admin-375.metadata.json`.

The desktop screenshot redacts only the disposable account identifier; the
portal UI and aggregate values were preserved. It shows 494 attempts during the
smoke session: 492 pre-existing attempts plus two temporary smoke attempts. The
authoritative post-cleanup database result is 492 attempts, as recorded in
`database-verification.json`.

The 1440 viewport label describes the original browser test viewport. Its
redaction pipeline may resize the raster image while preserving the visible
layout.

No email address, password, JWT, API-key value, or user/database UUID is stored
in this evidence bundle.
