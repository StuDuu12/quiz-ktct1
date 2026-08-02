# Student Course Layout and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a full-width horizontal mock-exam banner, explicit responsive **Tiếp tục/Xem lại** attempt actions, and deterministic top back navigation across the three role portals.

**Architecture:** Keep the current Next.js App Router structure and existing data queries. Introduce one presentational `ContextBackLink` component, reuse existing attempt/result URLs, restructure only the course overview markup, and add responsive CSS classes with no database changes. Behavior is covered by Testing Library component tests; geometry is covered by the existing Playwright-backed Vitest pattern using the real global stylesheet.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Phosphor Icons, CSS, Vitest, Testing Library, Playwright Chromium.

## Global Constraints

- Preserve the existing teal and peach palette, soft corners, Vietnamese typography, and low-motion product UI.
- Mock exam setup, allocation, timing, scoring, submission, deletion, route protection, and role separation must not change.
- Submitted attempts use the visible label **Xem lại**; in-progress attempts use **Tiếp tục**.
- Score is non-interactive data and remains visible at mobile widths.
- Touch targets are at least 44 by 44 pixels and no supported viewport may scroll horizontally.
- Back navigation uses explicit parent URLs and never `router.back()`.
- Do not modify or discard unrelated dirty files in the primary checkout.

---

### Task 1: Replace the floating back button with a deterministic top link

**Files:**
- Create: `src/components/context-back-link.tsx`
- Create: `tests/context-back-link.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `app/(protected)/history/page.tsx`
- Modify: `src/features/practice/components/practice-session.tsx`
- Modify: `src/features/exam/components/exam-session.tsx`
- Modify: `app/(protected)/courses/[courseSlug]/mock-exam/page.tsx`
- Modify: `app/(protected)/results/[attemptId]/page.tsx`
- Modify: `src/features/admin/components/admin-shell.tsx`
- Modify: `src/features/instructor/components/instructor-shell.tsx`
- Modify: `app/globals.css`
- Delete: `src/components/global-back-button.tsx`

**Interfaces:**
- Produces: `ContextBackLink({ href, label, className? }: { href: string; label: string; className?: string })`.
- Consumes: route parameters already present in course, practice, exam, and result components.

- [ ] **Step 1: Write the failing component tests**

Create `tests/context-back-link.test.tsx` with a real render of the shared link and role-shell renders at root and child paths:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ContextBackLink } from "@/src/components/context-back-link";
import { AdminShell } from "@/src/features/admin/components/admin-shell";
import { InstructorShell } from "@/src/features/instructor/components/instructor-shell";

afterEach(cleanup);

describe("contextual back navigation", () => {
  it("renders a visible deterministic parent link", () => {
    render(<ContextBackLink href="/history" label="Về lịch sử" />);
    expect(screen.getByRole("link", { name: "Về lịch sử" })).toHaveAttribute("href", "/history");
  });

  it("shows a parent link only on admin child pages", () => {
    pathname = "/admin/questions";
    const { rerender } = render(<AdminShell email="admin@example.test"><p>Nội dung</p></AdminShell>);
    expect(screen.getByRole("link", { name: "Về trang quản trị" })).toHaveAttribute("href", "/admin");
    pathname = "/admin";
    rerender(<AdminShell email="admin@example.test"><p>Nội dung</p></AdminShell>);
    expect(screen.queryByRole("link", { name: "Về trang quản trị" })).toBeNull();
  });

  it("shows a parent link only on instructor child pages", () => {
    pathname = "/instructor/reports";
    render(<InstructorShell email="teacher@example.test"><p>Nội dung</p></InstructorShell>);
    expect(screen.getByRole("link", { name: "Về trang giảng viên" })).toHaveAttribute("href", "/instructor");
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- tests/context-back-link.test.tsx`

Expected: FAIL because `src/components/context-back-link.tsx` does not exist.

- [ ] **Step 3: Add the shared top-link component**

Create `src/components/context-back-link.tsx`:

```tsx
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export function ContextBackLink({ href, label, className = "" }: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link className={["context-back-link", className].filter(Boolean).join(" ")} href={href}>
      <ArrowLeft size={18} weight="bold" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
```

Add the link immediately inside the relevant page header/content area using these exact mappings:

```tsx
<ContextBackLink href="/dashboard" label="Về tổng quan" />
<ContextBackLink href={`/courses/${state.courseSlug}`} label="Về học phần" />
<ContextBackLink href="/history" label="Về lịch sử" />
```

In `AdminShell`, render `<ContextBackLink href="/admin" label="Về trang quản trị" />` only when `pathname !== "/admin"`. In `InstructorShell`, use `/instructor` and **Về trang giảng viên** only when `pathname !== "/instructor"`.

Remove `<GlobalBackButton />` and its import from `app/layout.tsx`, delete the component, and remove `.global-back-button` CSS. Update existing practice/exam header links to use an arrow and visible **Về học phần** text instead of the book-logo treatment; review mode remains **Về lịch sử**.

- [ ] **Step 4: Run the focused navigation tests and verify GREEN**

Run: `npm test -- tests/context-back-link.test.tsx tests/practice-session.test.tsx tests/exam-session.test.tsx tests/course-overview.test.tsx`

Expected: all selected tests PASS with zero failures.

- [ ] **Step 5: Commit the navigation change**

```powershell
git add -- app/layout.tsx app/globals.css src/components/context-back-link.tsx src/components/global-back-button.tsx src/features/catalog/components/course-overview.tsx src/features/practice/components/practice-session.tsx src/features/exam/components/exam-session.tsx src/features/admin/components/admin-shell.tsx src/features/instructor/components/instructor-shell.tsx 'app/(protected)/history/page.tsx' 'app/(protected)/courses/[courseSlug]/mock-exam/page.tsx' 'app/(protected)/results/[attemptId]/page.tsx' tests/context-back-link.test.tsx
git commit -m "feat: add contextual top navigation"
```

---

### Task 2: Move the mock exam into a full-width horizontal banner

**Files:**
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `tests/course-overview.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: unchanged `CourseDashboard.mockExamAvailable` and `course.slug`.
- Produces: `.study-plan`, `.mock-banner`, `.mock-banner-copy`, `.mock-banner-meta`, `.mock-banner-action`, and `.study-tip-strip` layout hooks.

- [ ] **Step 1: Write the failing information-order test**

Add to `tests/course-overview.test.tsx`:

```tsx
it("places the mock exam and study tip before the full-width chapter plan", () => {
  render(<CourseOverview dashboard={dashboard} viewerRole="student" />);
  const mockTitle = screen.getByRole("heading", { name: /sẵn sàng kiểm tra kiến thức/i });
  const tip = screen.getByText("Mẹo ôn tập");
  const chapterTitle = screen.getByRole("heading", { name: "Luyện theo chương" });
  expect(mockTitle.compareDocumentPosition(chapterTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(tip.compareDocumentPosition(chapterTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: Run the course test and verify RED**

Run: `npm test -- tests/course-overview.test.tsx`

Expected: FAIL because the current mock exam and tip live in a sibling sidebar after the chapter panel.

- [ ] **Step 3: Restructure the course overview**

Replace `.dashboard-grid` plus `.study-aside` with this semantic order:

```tsx
<section className="study-plan" aria-label="Kế hoạch ôn tập">
  <section className="mock-banner" aria-labelledby="mock-title">
    <div className="mock-icon"><Target size={26} weight="fill" /></div>
    <div className="mock-banner-copy">
      <p className="eyebrow">THI THỬ TỔNG HỢP</p>
      <h2 id="mock-title">Sẵn sàng kiểm tra kiến thức?</h2>
      <p>Đề gồm 40 câu, phân bổ giữa các chương. Đồng hồ sẽ bắt đầu khi bạn vào đề.</p>
    </div>
    <div className="mock-banner-meta exam-meta">
      <span><ClipboardText size={17} /> 40 câu</span>
      <span><Clock size={17} /> 60 phút</span>
    </div>
    <div className="mock-banner-action">
      {mockExamAvailable ? (
        <Link className="primary-action" href={`/courses/${course.slug}/mock-exam`}>
          Bắt đầu thi thử <ArrowRight size={17} />
        </Link>
      ) : (
        <p className="primary-action" aria-disabled="true">Thi thử chưa được cấu hình</p>
      )}
    </div>
  </section>
  <section className="study-tip-strip">
    <TrendUp size={22} weight="duotone" aria-hidden="true" />
    <div>
      <strong>Mẹo ôn tập</strong>
      <p>Làm lại chương có độ chính xác thấp trước khi vào đề thi thử.</p>
    </div>
  </section>
  <div className="chapter-panel">
    <div className="section-heading">
      <div><p className="eyebrow">LỘ TRÌNH</p><h2>Luyện theo chương</h2></div>
      <span>{chapters.length} chương</span>
    </div>
    <div className="chapter-list">
      {chapters.map((chapter) => (
        <ChapterRow key={chapter.id} chapter={chapter} courseSlug={course.slug} />
      ))}
    </div>
  </div>
</section>
```

Use CSS Grid on `.mock-banner` for desktop, collapse to two columns below 860px, and one column below 580px. Keep the CTA at least 44px high, remove the old sidebar width, and give `.study-plan` and `.chapter-panel` `min-width: 0`.

- [ ] **Step 4: Run the course tests and verify GREEN**

Run: `npm test -- tests/course-overview.test.tsx`

Expected: all `CourseOverview` tests PASS.

- [ ] **Step 5: Commit the horizontal banner**

```powershell
git add -- src/features/catalog/components/course-overview.tsx tests/course-overview.test.tsx app/globals.css
git commit -m "feat: promote mock exam above chapter plan"
```

---

### Task 3: Make submitted and active attempt actions explicit

**Files:**
- Create: `tests/chapter-row-actions.test.tsx`
- Modify: `src/features/catalog/components/chapter-row.tsx`
- Modify: `src/features/catalog/components/course-overview.tsx`
- Modify: `src/features/history/components/history-list.tsx`
- Modify: `tests/history-components.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing attempt `id`, `status`, `score`, chapter position, and course slug.
- Produces: `.attempt-score`, `.attempt-action`, `.attempt-actions`, and `.attempt-delete` layout hooks; visible **Xem lại** and **Tiếp tục** links.

- [ ] **Step 1: Write failing attempt-action tests**

Create `tests/chapter-row-actions.test.tsx` with a `ChapterSummary` containing one submitted and one in-progress attempt. Assert these real user outcomes:

```tsx
expect(screen.getByText("95%")).not.toHaveAttribute("href");
expect(screen.getByRole("link", { name: "Xem lại" })).toHaveAttribute("href", "/results/submitted-1");
expect(screen.getByRole("link", { name: "Tiếp tục" })).toHaveAttribute(
  "href",
  "/courses/ktct/chapters/1/practice?attempt=active-1",
);
```

Change the submitted assertion in `tests/history-components.test.tsx` from `/xem kết quả/i` to the exact accessible label **Xem lại**, while retaining the immutable `/results/attempt-1` expectation.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/chapter-row-actions.test.tsx tests/history-components.test.tsx`

Expected: FAIL because chapter history currently uses the score link as the review action and history says **Xem kết quả**.

- [ ] **Step 3: Implement separate score and action controls**

For each chapter attempt, render non-interactive score text plus one action:

```tsx
<strong className="attempt-score">
  {attempt.score === null ? "—" : `${Math.round(attempt.score)}%`}
</strong>
<div className="attempt-actions">
  {attempt.status === "submitted" ? (
    <Link className="attempt-action" href={`/results/${attempt.id}`}>
      Xem lại <ArrowRight size={16} aria-hidden="true" />
    </Link>
  ) : attempt.status === "in_progress" ? (
    <Link className="attempt-action" href={`${practiceHref}?attempt=${attempt.id}`}>
      Tiếp tục <ArrowRight size={16} aria-hidden="true" />
    </Link>
  ) : null}
</div>
```

Use the same `.attempt-action` label and visual treatment in recent attempts and `HistoryList`. Wrap the delete component with `.attempt-delete` only for grid placement; do not change deletion behavior.

- [ ] **Step 4: Run attempt and history tests and verify GREEN**

Run: `npm test -- tests/chapter-row-actions.test.tsx tests/history-components.test.tsx tests/course-overview.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 5: Commit explicit review and resume actions**

```powershell
git add -- src/features/catalog/components/chapter-row.tsx src/features/catalog/components/course-overview.tsx src/features/history/components/history-list.tsx tests/chapter-row-actions.test.tsx tests/history-components.test.tsx app/globals.css
git commit -m "feat: clarify attempt review and resume actions"
```

---

### Task 4: Prove responsive geometry with the real stylesheet

**Files:**
- Create: `tests/course-actions-responsive.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: real static markup from `ChapterRow` and real `app/globals.css`.
- Produces: no application API; adds regression coverage for geometry at 375, 768, 1024, and 1440 pixels.

- [ ] **Step 1: Write the failing responsive geometry test**

Create a Playwright-backed Vitest test following `tests/dashboard-responsive.test.ts`. Render a chapter with submitted and in-progress history, open its native `details`, and at widths `[375, 768, 1024, 1440]` assert:

```ts
expect(reviewBox!.width).toBeGreaterThanOrEqual(44);
expect(resumeBox!.width).toBeGreaterThanOrEqual(44);
expect(deleteBox!.width).toBeGreaterThanOrEqual(44);
expect(scoreBox!.width).toBeGreaterThan(0);
expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(viewportWidth);
expect(resumeBox!.x + resumeBox!.width).toBeLessThanOrEqual(viewportWidth);
```

Also assert `document.documentElement.scrollWidth <= window.innerWidth` and that the mock banner CTA is full-width only at 375px.

- [ ] **Step 2: Run the geometry test and verify RED**

Run: `npm test -- tests/course-actions-responsive.test.tsx`

Expected: FAIL at 375px because `.attempt-score` is currently hidden and the row lacks a dedicated action column/row.

- [ ] **Step 3: Complete responsive CSS**

Use named grid areas for `.attempt-row`:

```css
.attempt-row {
  grid-template-columns: 2.5rem minmax(0, 1fr) auto auto auto auto;
  grid-template-areas: "icon body status score actions delete";
}

@media (max-width: 580px) {
  .attempt-row {
    grid-template-columns: 2.5rem minmax(0, 1fr) auto;
    grid-template-areas:
      "icon body status"
      ". score delete"
      ". actions actions";
  }
  .attempt-action { width: 100%; min-height: 44px; }
  .attempt-score { display: block; text-align: left; }
}
```

Assign `.attempt-icon`, the identity block, `.status-pill`, `.attempt-score`, `.attempt-actions`, and `.attempt-delete` to the six named areas. Add `min-width: 0` to `.attempt-actions`.

Use the corresponding history-card layout:

```css
@media (max-width: 580px) {
  .history-card {
    grid-template-columns: 2.5rem minmax(0, 1fr) auto;
    grid-template-areas:
      "icon main result"
      ". actions actions";
  }
  .history-card-icon { grid-area: icon; }
  .history-card-main { grid-area: main; }
  .history-card-result { grid-area: result; }
  .history-card-actions { grid-area: actions; width: 100%; }
  .history-result-link { min-height: 44px; flex: 1; justify-content: center; }
}
```

- [ ] **Step 4: Run all responsive tests and verify GREEN**

Run: `npm test -- tests/course-actions-responsive.test.tsx tests/dashboard-responsive.test.ts`

Expected: both responsive test files PASS at all four widths.

- [ ] **Step 5: Commit responsive geometry**

```powershell
git add -- app/globals.css tests/course-actions-responsive.test.tsx
git commit -m "fix: keep attempt actions responsive"
```

---

### Task 5: Full verification and visual QA

**Files:**
- Modify only if verification exposes a regression in files already listed above.

**Interfaces:**
- Consumes: the completed UI and all repository checks.
- Produces: verified implementation ready to integrate.

- [ ] **Step 1: Run the complete unit/component suite**

Run: `npm test`

Expected: all test files PASS with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 and all application routes compile.

- [ ] **Step 4: Perform browser visual QA**

Start the app with `npm run dev`, then inspect the course page at 1440x900, 768x1024, and 375x812. Verify the banner order, full-width chapter list, study-tip strip, expanded submitted/in-progress rows, explicit actions, visible scores, top back links, focus states, and absence of horizontal overflow.

- [ ] **Step 5: Review the final diff against the approved spec**

Run:

```powershell
git status --short
git diff --check HEAD~4..HEAD
git log --oneline -5
```

Confirm that no database, scoring, submission, timing, deletion, or role-protection code changed.
