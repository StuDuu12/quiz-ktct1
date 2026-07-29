# Production release audit — 2026-07-30

This directory contains the durable, redacted evidence for the KTCT role-portal
production release.

## Evidence index

- [Administrator portal — 375 viewport](production-admin-375.png)
- [Administrator portal — 1440 viewport](production-admin-1440.png)
- [Cold-probe evidence](cold-probes.json)
- [Deployment and Worker secret evidence](deployment-secret-evidence.txt)
- [Database verification and cleanup evidence](database-verification.json)

The screenshots were captured during authenticated production smoke testing.
Only the disposable account identifier was redacted; the portal UI and aggregate
values were preserved. The desktop screenshot shows 494 attempts during the
smoke session: 492 pre-existing attempts plus two temporary smoke attempts. The
authoritative post-cleanup database result is 492 attempts, as recorded in
`database-verification.json`.

The viewport labels describe the browser test viewport. The redaction pipeline
may resize the raster image while preserving the visible layout.

No email address, password, JWT, API-key value, or user/database UUID is stored
in this evidence bundle.
