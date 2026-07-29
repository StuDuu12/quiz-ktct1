# Three Role Portals and Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public landing page followed by server-authoritative role routing into isolated Student, Instructor, and Admin portals, while fixing production practice, mock-exam, typography, and responsive failures.

**Architecture:** Keep one Next.js/Vinext application and one Supabase project. Add a server-owned login destination resolver, route-specific shells and guards, POST-only attempt creation, idempotent production exam configuration, and a shared Vietnamese typography/token layer. Reuse current content-management pages behind isolated portal layouts instead of duplicating business logic.

**Tech Stack:** Next.js 16.2.6, Vinext, React 19.2.6, TypeScript 5.9, Supabase Auth/Postgres/RPC/RLS, Vitest, Testing Library, Playwright, Cloudflare Workers, native CSS/CSS Modules, Phosphor Icons.

## Global Constraints

- `/` remains the public landing page; unauthenticated visitors are not redirected automatically.
- Login destinations are server-derived from `public.profiles.role`: student `/dashboard`, instructor `/instructor`, admin `/admin`.
- `/admin` is admin-only; `/instructor` is instructor-only; admin uses its own content-management routes.
- Admin can deliberately open Student view, where a “Trang quản trị” link is visible only to admin.
- GET/RSC rendering must never create an attempt.
- Production mock exam configuration is exactly 40 questions, 3,600 seconds, active, and idempotently seeded.
- Do not delete the existing accidental production attempts.
- Font is `Be Vietnam Pro` with `display: swap`; body, input, answer, and mobile CTA text are at least 16px.
- Responsive verification viewports are 375, 768, 1024, and 1440px; no horizontal overflow.
- Quiz question sidebar is desktop-only from 1024px; smaller widths use the existing drawer/sheet pattern.
- Landing page uses the approved generated study image, Phosphor icons, one teal accent, real content, and no fake product screenshot.
- Landing page visible copy contains no em dash or en dash characters.
- Service-role credentials stay server-side and out of source, logs, client bundles, and reports.
- Every production-code change follows RED, GREEN, REFACTOR and receives an independent review before the next task.

---

### Task 1: Server-authoritative role destination after login

**Files:**
- Create: `src/features/auth/destination.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `src/lib/supabase/browser.ts`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/api/e2e/auth/login/route.ts`
- Modify: `src/e2e/store.ts`
- Test: `tests/auth-login-route.test.ts`
- Test: `tests/auth-destination.test.ts`
- Test: `tests/auth-pages.test.tsx`

**Interfaces:**
- Produces: `type PortalDestination = "/dashboard" | "/instructor" | "/admin"`.
- Produces: `portalDestinationForRole(role: AppRole): PortalDestination`.
- Produces: `signIn(identifier, password): Promise<{ data: { role: AppRole; destination: PortalDestination } | null; error: { message: string } | null }>` on success/failure.
- Consumes: existing `normalizeLoginIdentifier`, orphan-JWT recovery, Supabase server client, and `AppRole`.

- [ ] **Step 1: Write destination unit tests**

```ts
import { describe, expect, it } from "vitest";
import { portalDestinationForRole } from "@/src/features/auth/destination";

describe("portalDestinationForRole", () => {
  it.each([
    ["student", "/dashboard"],
    ["instructor", "/instructor"],
    ["admin", "/admin"],
  ] as const)("maps %s to %s", (role, destination) => {
    expect(portalDestinationForRole(role)).toBe(destination);
  });
});
```

- [ ] **Step 2: Extend the login route tests for profile lookup**

Mock `supabase.from("profiles").select(...).eq(...).maybeSingle()` and assert:

```ts
await expect(response.json()).resolves.toEqual({
  error: null,
  role: "admin",
  destination: "/admin",
});
```

Add failures for missing profile and `is_active: false`, both returning `403` and no destination.

- [ ] **Step 3: Run RED tests**

Run:

```powershell
npm test -- tests/auth-destination.test.ts tests/auth-login-route.test.ts tests/auth-pages.test.tsx
```

Expected: destination module is missing and current login JSON only contains `{ error: null }`.

- [ ] **Step 4: Implement the pure destination resolver**

```ts
import type { AppRole } from "@/src/features/auth/roles";

export type PortalDestination = "/dashboard" | "/instructor" | "/admin";

export function portalDestinationForRole(role: AppRole): PortalDestination {
  if (role === "admin") return "/admin";
  if (role === "instructor") return "/instructor";
  return "/dashboard";
}
```

- [ ] **Step 5: Return role and destination from both login APIs**

After successful Auth sign-in, read the authenticated user ID from `result.data.user`, query `profiles` for `role,is_active`, reject inactive/missing profiles, then return:

```ts
NextResponse.json({
  error: null,
  role: profile.role,
  destination: portalDestinationForRole(profile.role),
});
```

Keep the cookie-preserving orphan-JWT retry behavior. Make the E2E login route return the same shape from its fixture viewer.

- [ ] **Step 6: Update the browser wrapper and login page**

Parse the typed payload in `signIn`. Replace the unconditional:

```ts
router.replace("/dashboard");
```

with:

```ts
if (!data) {
  setMessage("Không xác định được không gian làm việc.");
  return;
}
router.replace(data.destination);
router.refresh();
```

Keep the submit button disabled during the request.

- [ ] **Step 7: Run GREEN tests and quality checks**

Run:

```powershell
npm test -- tests/auth-destination.test.ts tests/auth-login-route.test.ts tests/auth-pages.test.tsx
npm run typecheck
npm run lint
```

Expected: all pass with no new warnings.

- [ ] **Step 8: Commit**

```powershell
git add app/api/auth/login/route.ts app/api/e2e/auth/login/route.ts "app/(auth)/login/page.tsx" src/features/auth/destination.ts src/lib/supabase/browser.ts src/e2e/store.ts tests/auth-destination.test.ts tests/auth-login-route.test.ts tests/auth-pages.test.tsx
git commit -m "feat: route sign-ins by profile role"
```

---

### Task 2: Isolated Admin and Instructor portals

**Files:**
- Create: `app/(instructor)/instructor/layout.tsx`
- Create: `app/(instructor)/instructor/page.tsx`
- Create: `app/(instructor)/instructor/courses/page.tsx`
- Create: `app/(instructor)/instructor/questions/page.tsx`
- Create: `app/(instructor)/instructor/import/page.tsx`
- Create: `app/(instructor)/instructor/reports/page.tsx`
- Create: `src/features/instructor/components/instructor-shell.tsx`
- Create: `src/features/instructor/components/instructor-navigation.tsx`
- Modify: `app/(admin)/admin/layout.tsx`
- Modify: `src/features/admin/components/admin-shell.tsx`
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `app/(protected)/dashboard/page.tsx`
- Test: `tests/session.test.ts`
- Test: `tests/admin-shell.test.tsx`
- Test: `tests/instructor-portal.test.tsx`
- Test: `tests/course-overview.test.tsx`

**Interfaces:**
- Consumes: `requireViewer`, existing admin content pages, existing `canManageCourse`/assignment checks, `AppRole`.
- Produces: `InstructorShell({ email, children })`.
- Produces: `CourseOverview({ dashboard, viewerRole })`, where `viewerRole` controls only the cross-portal admin link, never authorization.

- [ ] **Step 1: Add failing route-guard and navigation tests**

Assert:

```ts
expect(adminLayoutSource).toContain('requireViewer(["admin"])');
expect(instructorLayoutSource).toContain('requireViewer(["instructor"])');
expect(instructorNavigation).not.toContain("Người dùng");
expect(instructorNavigation).not.toContain("Nhật ký hệ thống");
```

Render `CourseOverview` with `viewerRole="admin"` and assert a `/admin` link named “Trang quản trị”; render with `student` and assert it is absent.

- [ ] **Step 2: Run RED tests**

```powershell
npm test -- tests/session.test.ts tests/admin-shell.test.tsx tests/instructor-portal.test.tsx tests/course-overview.test.tsx
```

Expected: instructor routes/shell do not exist and admin layout still accepts instructors.

- [ ] **Step 3: Make Admin layout admin-only**

Use:

```ts
const viewer = await requireViewer(["admin"]);
```

Remove the current student-only redirect branch. Keep `AdminShell` and its “Xem như học viên” link to `/dashboard`.

- [ ] **Step 4: Create Instructor shell and navigation**

Navigation contains only:

```ts
[
  { href: "/instructor", label: "Tổng quan" },
  { href: "/instructor/courses", label: "Học phần" },
  { href: "/instructor/questions", label: "Ngân hàng câu hỏi" },
  { href: "/instructor/import", label: "Nhập dữ liệu" },
  { href: "/instructor/reports", label: "Báo cáo" },
]
```

The layout requires exactly `["instructor"]` and passes the authenticated email into `InstructorShell`.

- [ ] **Step 5: Reuse content page implementations behind instructor routes**

Each instructor route re-exports the corresponding current content page:

```ts
export { default } from "@/app/(admin)/admin/questions/page";
```

Use only content pages already protected by assignment-aware queries/RPCs. Do not expose `/admin/users` or admin-only audit views. Update `revalidatePath` calls in shared server actions to revalidate both matching `/admin/...` and `/instructor/...` paths.

- [ ] **Step 6: Add role-aware cross-portal navigation**

Change dashboard call to:

```tsx
<CourseOverview dashboard={data} viewerRole={viewer.role} />
```

For admin, show “Trang quản trị” in `StudentShell` navigation. Do not show Instructor/Admin content links to students.

- [ ] **Step 7: Run GREEN tests, typecheck, and lint**

```powershell
npm test -- tests/session.test.ts tests/admin-shell.test.tsx tests/instructor-portal.test.tsx tests/course-overview.test.tsx
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```powershell
git add "app/(admin)/admin/layout.tsx" "app/(instructor)" "app/(protected)/dashboard/page.tsx" src/features/admin src/features/instructor src/features/catalog/components/course-overview.tsx tests
git commit -m "feat: isolate admin and instructor portals"
```

---

### Task 3: Safe three-role administration

**Files:**
- Create: `supabase/migrations/202607300001_admin_role_management.sql`
- Modify: `src/features/admin/actions.ts`
- Modify: `app/(admin)/admin/users/page.tsx`
- Modify: `src/lib/supabase/database.types.ts`
- Test: `tests/advanced-admin-database-security.test.ts`
- Test: `tests/admin-actions.test.ts`
- Test: `tests/admin-users-page.test.tsx`

**Interfaces:**
- Produces RPC: `admin_set_user_role(target_user_id uuid, target_role public.app_role) returns void`.
- Produces server action: `setUserRoleForm(formData: FormData): Promise<void>`.
- Consumes: `public.assert_admin_actor`, `public.write_audit_log`, `protect_profile_privileged_fields`, current `admin_set_instructor`.

- [ ] **Step 1: Add failing database contract tests**

Assert the migration contains:

```sql
actor := public.assert_admin_actor();
```

and rejects:

- changing the acting admin’s own role;
- demoting/deactivating the last active admin;
- direct execution by `anon` or `authenticated` outside the guarded function;
- unsupported role text.

Assert successful changes write action `profile.role_changed`.

- [ ] **Step 2: Add failing action/page tests**

Render the user page and expect a labelled role `<select>` with `student`, `instructor`, `admin`, plus a submit button. Test `setUserRoleForm` calls:

```ts
supabase.rpc("admin_set_user_role", {
  target_user_id: userId,
  target_role: role,
});
```

- [ ] **Step 3: Run RED tests**

```powershell
npm test -- tests/advanced-admin-database-security.test.ts tests/admin-actions.test.ts tests/admin-users-page.test.tsx
```

- [ ] **Step 4: Implement the guarded RPC**

The function locks the target profile, rejects self-role changes, and before changing an existing admin verifies:

```sql
select count(*)
from public.profiles
where role = 'admin' and is_active and id <> target_user_id;
```

If the target becomes `student` or `admin`, delete its `course_instructors` rows. Update role and `is_active = true`, then call `write_audit_log` with old/new profile JSON. Grant execute only to `authenticated`; the internal `assert_admin_actor()` remains authoritative.

- [ ] **Step 5: Implement role action and UI feedback**

Validate inputs with:

```ts
z.object({
  userId: z.string().uuid(),
  role: z.enum(["student", "instructor", "admin"]),
});
```

Call the RPC, surface its real safe message through the existing action-state pattern, and revalidate `/admin/users`.

- [ ] **Step 6: Regenerate or manually update database types**

Add the exact `admin_set_user_role` argument and return signatures to `database.types.ts`, following adjacent RPC definitions.

- [ ] **Step 7: Run GREEN tests**

```powershell
npm test -- tests/advanced-admin-database-security.test.ts tests/admin-actions.test.ts tests/admin-users-page.test.tsx
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/202607300001_admin_role_management.sql src/features/admin/actions.ts "app/(admin)/admin/users/page.tsx" src/lib/supabase/database.types.ts tests
git commit -m "feat: manage user roles safely"
```

---

### Task 4: POST-only practice start and resumable attempts

**Files:**
- Create: `supabase/migrations/202607300002_resume_practice_attempt.sql`
- Create: `src/features/practice/start-or-resume.ts`
- Create: `src/features/practice/components/practice-launch-form.tsx`
- Modify: `app/(protected)/courses/[courseSlug]/chapters/[position]/practice/page.tsx`
- Modify: `app/(protected)/practice/[chapterId]/page.tsx`
- Modify: `src/features/practice/actions.ts`
- Modify: `src/features/catalog/queries.ts`
- Modify: `src/features/catalog/components/chapter-row.tsx`
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `app/globals.css`
- Modify: `src/lib/supabase/database.types.ts`
- Test: `tests/practice-actions.test.ts`
- Test: `tests/practice-route.test.tsx`
- Test: `tests/practice-resume.test.ts`
- Test: `tests/dashboard-responsive.test.ts`

**Interfaces:**
- Produces RPC: `start_or_resume_practice(target_course_id uuid, target_chapter_id uuid) returns public.attempts`.
- Produces action: `startOrResumePracticeForRoute(courseSlug: string, position: number): Promise<never>` that redirects.
- Produces `ChapterSummary.activeAttemptId: string | null`.
- Consumes: current `start_attempt`, `loadPracticeSession`, viewer ID from Auth.

- [ ] **Step 1: Write failing GET/prefetch and resume tests**

Verify rendering a practice route without `attempt`:

```ts
expect(startPractice).not.toHaveBeenCalled();
expect(screen.getByRole("button", { name: /bắt đầu luyện tập/i })).toBeVisible();
```

Verify one action call returns/redirects with one attempt ID; rendering with that ID does not call start again. Verify a chapter with `activeAttemptId` renders “Tiếp tục”.

- [ ] **Step 2: Strengthen the dashboard geometry test**

Replace the source-only assertion with a Playwright/component geometry assertion at 375, 768, 1024, and 1440. For every `.chapter-row`, assert:

```ts
expect(actionBox.x).toBeGreaterThan(bodyBox.x);
expect(actionBox.y).toBeLessThanOrEqual(rowBox.y + rowBox.height);
expect(actionBox.width).toBeGreaterThanOrEqual(44);
```

Also assert button text remains visible on 375px.

- [ ] **Step 3: Run RED tests**

```powershell
npm test -- tests/practice-actions.test.ts tests/practice-route.test.tsx tests/practice-resume.test.ts tests/dashboard-responsive.test.ts
```

Expected: GET currently invokes `startPractice`, summaries lack active attempt IDs, and desktop action geometry fails.

- [ ] **Step 4: Add atomic start-or-resume RPC**

Use a transaction-level advisory lock derived from `auth.uid()` and `target_chapter_id`. Under the lock:

1. Select the newest valid `in_progress` practice attempt for the same user/course/chapter.
2. Return it when unexpired.
3. Otherwise call or inline the existing `start_attempt` path once.

Do not delete older attempts. Grant execute to `authenticated`.

- [ ] **Step 5: Move mutation into a server action**

The route without `attempt` renders a launch form. The form action calls `start_or_resume_practice` then:

```ts
redirect(
  `/courses/${course.slug}/chapters/${chapter.position}/practice?attempt=${attempt.id}`,
);
```

The client form marks hydration and disables the button while pending. No password or attempt mutation may fall back to GET.

- [ ] **Step 6: Add active attempt IDs to dashboard queries**

Select latest unexpired `in_progress` practice attempt per chapter for the current user and expose it as `activeAttemptId`. The row CTA links directly to the URL containing that ID and uses “Tiếp tục”; otherwise it links to the non-mutating launch page.

- [ ] **Step 7: Fix chapter grid**

Give `.chapter-details` one real grid area instead of `display: contents`, or define an explicit five-track desktop grid. The chosen implementation must keep all five semantic regions inside the row and switch to named areas below 860px. Remove `font-size: 0` from mobile `.practice-link`.

- [ ] **Step 8: Run GREEN tests**

```powershell
npm test -- tests/practice-actions.test.ts tests/practice-route.test.tsx tests/practice-resume.test.ts tests/dashboard-responsive.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 9: Commit**

```powershell
git add supabase/migrations/202607300002_resume_practice_attempt.sql src/features/practice src/features/catalog "app/(protected)" app/globals.css src/lib/supabase/database.types.ts tests
git commit -m "fix: start and resume practice safely"
```

---

### Task 5: Provision and verify the production mock exam

**Files:**
- Modify: `scripts/production/database.ts`
- Modify: `scripts/production/verify.ts`
- Modify: `src/features/catalog/queries.ts`
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `app/(protected)/courses/[courseSlug]/mock-exam/page.tsx`
- Test: `tests/production-database.test.ts`
- Test: `tests/exam-actions.test.ts`
- Test: `tests/course-overview.test.tsx`

**Interfaces:**
- Produces `ProductionCounts.activeMockExamConfigs`.
- Produces `CourseDashboard.mockExamAvailable: boolean`.
- Consumes existing `exam_configs`, `getMockExamLaunch`, `ExamLaunchForm`, and production service-role client.

- [ ] **Step 1: Write failing seed and verify tests**

After calling `seedProduction` twice, assert exactly one row:

```ts
expect(configs).toEqual([
  expect.objectContaining({
    kind: "mock_exam",
    question_count: 40,
    duration_seconds: 3600,
    is_active: true,
  }),
]);
```

Make `verifyProductionCounts` reject zero, inactive, or duplicate active mock configs.

- [ ] **Step 2: Add failing UI availability tests**

Render dashboard with `mockExamAvailable: false` and assert no active launch link, plus visible text “Thi thử chưa được cấu hình”. Render `true` and assert the launch link exists.

- [ ] **Step 3: Run RED tests**

```powershell
npm test -- tests/production-database.test.ts tests/exam-actions.test.ts tests/course-overview.test.tsx
```

- [ ] **Step 4: Upsert the mock config during production seed**

Use a deterministic UUID from:

```ts
stableUuid(`ktct:${COURSE_SLUG}:mock-exam`)
```

Upsert `course_id`, title, `kind`, `question_count`, `duration_seconds`, and `is_active`. Conflict on the deterministic ID. Do not create a second active config.

- [ ] **Step 5: Verify config as part of production counts**

Query active mock config rows for the course. Extend the failure message to include `active_mock_exam_configs`, question count, and duration. Production setup cannot report success without the config.

- [ ] **Step 6: Make dashboard and launch error explicit**

Add `mockExamAvailable` to dashboard data. Disable the CTA with a clear message when unavailable. Replace the launch page’s generic `notFound()` for missing config with a message-state containing “Quay lại tổng quan”.

- [ ] **Step 7: Run GREEN tests**

```powershell
npm test -- tests/production-database.test.ts tests/exam-actions.test.ts tests/course-overview.test.tsx
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```powershell
git add scripts/production src/features/catalog "app/(protected)/courses/[courseSlug]/mock-exam/page.tsx" tests
git commit -m "fix: provision production mock exams"
```

---

### Task 6: Approved landing page and Vietnamese typography

**Files:**
- Create: `src/features/public/landing-page.tsx`
- Create: `src/features/public/landing-page.module.css`
- Create: `public/images/ktct-study-hero.png`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `src/lib/site-metadata.ts`
- Test: `tests/public-home.test.tsx`
- Test: `tests/site-metadata.test.ts`
- Test: `tests/typography.test.ts`

**Interfaces:**
- Produces `LandingPage` server component.
- Produces root font CSS variable `--font-be-vietnam-pro`.
- Consumes approved image from `.superpowers/brainstorm/1085-1785350332/content/landing-hero-study.png`.

- [ ] **Step 1: Write failing landing and typography tests**

Assert:

- navigation has “Giới thiệu”, “Lộ trình”, “Vai trò”, “Đăng nhập”;
- primary `/login` and secondary `/register` CTAs;
- exact facts 497, 6, 40, 60;
- three role descriptions;
- hero uses `next/image` with Vietnamese alt text;
- rendered visible copy contains neither `—` nor `–`;
- root layout applies the Be Vietnam Pro variable;
- CSS mobile input/body/answer values are at least `1rem`.

- [ ] **Step 2: Run RED tests**

```powershell
npm test -- tests/public-home.test.tsx tests/site-metadata.test.ts tests/typography.test.ts
```

- [ ] **Step 3: Add the font through Next.js**

Use:

```ts
import { Be_Vietnam_Pro } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-be-vietnam-pro",
});
```

Apply the variable to `<body>`. Set the global family to `var(--font-be-vietnam-pro), "Noto Sans", system-ui, sans-serif`.

- [ ] **Step 4: Copy and optimize the approved image**

Copy:

```powershell
Copy-Item -LiteralPath ".superpowers\brainstorm\1085-1785350332\content\landing-hero-study.png" -Destination "public\images\ktct-study-hero.png"
```

Keep the original. Use `next/image` with declared dimensions, `priority`, and responsive `sizes`.

- [ ] **Step 5: Implement the approved landing page**

Use an asymmetric split hero, facts strip, one large Student feature plus two stacked Instructor/Admin features, and closing login CTA. Use CSS Module styles so landing rules do not leak into portals. Motion level is 3: only hover/active/focus transitions and `prefers-reduced-motion` support; add no animation dependency.

- [ ] **Step 6: Normalize Vietnamese typography**

Replace synthetic weights such as 750/850/900 with 700/800. Reduce Vietnamese heading tracking to no tighter than `-0.02em`. Set mobile form inputs, question text, option text, and main CTAs to at least `1rem` with line-height `1.5`.

- [ ] **Step 7: Run GREEN tests**

```powershell
npm test -- tests/public-home.test.tsx tests/site-metadata.test.ts tests/typography.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```powershell
git add app/page.tsx app/layout.tsx app/globals.css public/images/ktct-study-hero.png src/features/public src/lib/site-metadata.ts tests
git commit -m "feat: redesign public learning landing"
```

---

### Task 7: Responsive portals and complete role/function verification

**Files:**
- Modify: `app/globals.css`
- Modify: `src/features/practice/components/practice-session.tsx`
- Modify: `src/features/exam/components/question-navigator.tsx`
- Modify: `src/features/admin/components/admin-shell.tsx`
- Modify: `src/features/instructor/components/instructor-shell.tsx`
- Modify: `e2e/helpers.ts`
- Create: `e2e/role-portals.spec.ts`
- Modify: `e2e/practice.spec.ts`
- Modify: `e2e/mock-exam.spec.ts`
- Create: `e2e/responsive.spec.ts`
- Test: `tests/dashboard-responsive.test.ts`
- Test: `tests/practice-session.test.tsx`
- Test: `tests/exam-session.test.tsx`

**Interfaces:**
- Consumes outputs of Tasks 1-6.
- Produces an E2E role matrix and viewport matrix used as the release gate.

- [ ] **Step 1: Add failing role-matrix E2E tests**

For fixture users `student`, `instructor`, and `admin`, verify:

```ts
student -> /dashboard
instructor -> /instructor
admin -> /admin
```

Then verify student receives no admin/instructor content, instructor cannot open `/admin/users`, and admin can switch to Student view and back.

- [ ] **Step 2: Add failing function-path E2E tests**

Cover:

- student starts one practice attempt, reloads, answers, flags, reviews, finishes, and sees history;
- student starts one 40-question mock exam, navigates questions, flags, reviews, submits;
- instructor opens assigned content, edits a draft, and is denied unassigned content;
- admin changes a disposable user role, changes it back, manages active status, and sees audit evidence.

Use disposable E2E fixture records only.

- [ ] **Step 3: Add failing responsive geometry tests**

At 375, 768, 1024, and 1440:

- assert `document.documentElement.scrollWidth <= window.innerWidth`;
- assert nav does not overlap or wrap unexpectedly;
- assert every major CTA has bounding box at least 44px high;
- assert chapter actions remain within their rows;
- assert quiz sidebar is absent below 1024 and drawer trigger is visible;
- assert quiz sidebar is visible at 1024 and 1440;
- assert computed input/body/answer font size is at least 16px on mobile.

- [ ] **Step 4: Run RED tests**

```powershell
npm test -- tests/dashboard-responsive.test.ts tests/practice-session.test.tsx tests/exam-session.test.tsx
npm run test:e2e -- e2e/role-portals.spec.ts e2e/practice.spec.ts e2e/mock-exam.spec.ts e2e/responsive.spec.ts
```

- [ ] **Step 5: Implement responsive breakpoints**

Use 480/768/1024/1280 rules and 16/24/32px gutters. Move practice/exam sidebar breakpoint from 767px to 1023px. Add safe-area spacing:

```css
bottom: calc(1rem + env(safe-area-inset-bottom));
```

Ensure admin/instructor sidebars use a labelled mobile header and a keyboard-dismissable backdrop.

- [ ] **Step 6: Fix E2E login hydration**

Update helpers to wait for a hydrated marker before submit:

```ts
await expect(page.locator("form[data-hydrated='true']")).toBeVisible();
```

Assert password never appears in the URL. Keep form submission POST-only.

- [ ] **Step 7: Run GREEN unit and E2E suites**

```powershell
npm test
npm run typecheck
npm run lint
npm run test:e2e
```

Expected: all suites pass, no leaked query-string passwords, no horizontal overflow.

- [ ] **Step 8: Commit**

```powershell
git add app/globals.css src/features e2e tests
git commit -m "fix: complete responsive role workflows"
```

---

### Task 8: Production migration, deployment, and smoke verification

**Files:**
- Modify only if verification exposes a release-specific defect: `scripts/production/smoke.ts`
- Record: `.superpowers/sdd/2026-07-30-three-role-portals-reliability/task-8-report.md`

**Interfaces:**
- Consumes all previous task commits, Supabase service-role secret, public Supabase URL/anon key, Cloudflare Worker configuration.
- Produces verified Supabase migrations, production config, deployed Worker version, and smoke report without secrets.

- [ ] **Step 1: Run the complete local release gate**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: zero failures.

- [ ] **Step 2: Inspect the client build for secret and alias safety**

Search built client assets:

```powershell
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|admin@ktct.example" dist .next
```

Expected: no service-role value and no internal admin alias email in client bundles. The public Supabase URL may be present.

- [ ] **Step 3: Apply migrations and production setup**

Run the established migration mechanism for:

- `202607300001_admin_role_management.sql`
- `202607300002_resume_practice_attempt.sql`

Then:

```powershell
npm run production:preflight
npm run production:setup
npm run production:verify
```

Expected: course/chapter/question counts remain correct and exactly one active 40-question/3,600-second mock config exists.

- [ ] **Step 4: Deploy the Worker**

Build with real public environment values and a non-secret build-time server placeholder. Deploy `dist/server/wrangler.json` to Worker `ktct-luyen-thi-mac-lenin-2026`, then immediately upload the real `SUPABASE_SERVICE_ROLE_KEY` secret because generated Wrangler configuration does not retain undeclared secret bindings.

- [ ] **Step 5: Run production role smoke tests**

Using isolated test accounts:

- confirm public `/` and both auth pages render;
- confirm each role lands at the correct portal;
- confirm route denials;
- start/resume exactly one practice attempt;
- start one 40-question mock exam;
- verify history persistence;
- verify 375/768/1024/1440 screenshots and geometry.

Delete only disposable test accounts/attempts created by this smoke run. Do not alter real attempts or histories.

- [ ] **Step 6: Run final production verification**

```powershell
npm run production:smoke
```

Read back profile roles, active mock config, and the latest deployment status. Record URLs, test counts, and non-secret evidence in the task report.

- [ ] **Step 7: Commit any verified smoke-script-only adjustment**

If no code changed, do not create an empty commit. If `scripts/production/smoke.ts` required a tested adjustment:

```powershell
git add scripts/production/smoke.ts
git commit -m "test: verify production role portals"
```
