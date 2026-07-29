# Task 2 report: Isolated Admin and Instructor portals

## Changed files

- `app/(admin)/admin/layout.tsx` — restricts the administration layout to `admin` and uses an admin-only shell.
- `app/(admin)/admin/page.tsx` — keeps shared dashboard CTAs inside the active admin or instructor portal.
- `app/(admin)/admin/questions/page.tsx` — keeps the shared question-bank import CTA inside the active portal.
- `app/(instructor)/instructor/layout.tsx` and its five content routes — adds the instructor-only route group and re-exports only assignment-aware content pages.
- `src/features/admin/actions.ts` — invalidates matching instructor paths after shared content mutations.
- `src/features/admin/components/admin-shell.tsx` — removes the instructor variant from the admin shell.
- `src/features/instructor/components/instructor-shell.tsx` and `instructor-navigation.tsx` — adds the isolated instructor UI with only overview, courses, question bank, import, and reports destinations.
- `src/features/catalog/components/course-overview.tsx` and both callers — make the cross-portal admin link role-aware.
- `tests/session.test.ts`, `tests/admin-shell.test.tsx`, `tests/instructor-portal.test.tsx`, and `tests/course-overview.test.tsx` — cover guards, instructor navigation, instructor-safe shared CTAs, admin cross-portal navigation, and student omission.

## RED evidence

Command:

```powershell
npm test -- tests/session.test.ts tests/admin-shell.test.tsx tests/instructor-portal.test.tsx tests/course-overview.test.tsx
```

Initial result: 4 expected failures — no instructor layout, no instructor navigation, admin layout did not contain `requireViewer(["admin"])`, and the admin learner portal link was absent.

Additional focused RED runs:

```powershell
npm test -- tests/instructor-portal.test.tsx
```

- Expected `/instructor/questions`, received `/admin/questions` for an instructor dashboard CTA.
- Expected `/instructor/import`, received `/admin/import` for an instructor question-bank CTA.

## GREEN verification

```powershell
npm test -- tests/session.test.ts tests/admin-shell.test.tsx tests/instructor-portal.test.tsx tests/course-overview.test.tsx
# 4 test files passed; 13 tests passed

npm run typecheck
# exited 0

npm run lint
# exited 0

git diff --check
# exited 0
```

## Self-review

- Confirmed the admin layout calls exactly `requireViewer(["admin"])`; instructors cannot enter `/admin`.
- Confirmed the instructor layout calls exactly `requireViewer(["instructor"])` and passes the authenticated email to `InstructorShell`.
- Confirmed instructor navigation excludes users and audit/system-log destinations, and no instructor route was created for `/admin/users`.
- Confirmed the re-exported shared dashboard and question-bank pages derive CTA prefixes from the authenticated role, avoiding links from instructor pages into the admin-only guard.
- Confirmed shared actions invalidate the matching `/instructor` routes while admin-only user cache paths remain admin-only.
- Confirmed every `CourseOverview` caller provides `viewerRole`; only admins receive the `/admin` link.
- Independent review initially identified the two shared-page CTA issues above; both received RED tests and were fixed before the final GREEN run.

## Concerns

None. Authorization remains server-owned through the route layouts and the existing assignment-aware queries/RPCs; UI role checks only determine portal navigation URLs.
