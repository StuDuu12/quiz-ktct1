# Student Course Layout, Review Actions, and Back Navigation Design

**Date:** 2026-08-02
**Status:** Proposed for final user review
**Selected direction:** A

## Objective

Improve the student course experience without changing the existing visual identity:

1. Move the mock exam promotion above the chapter-learning section and make it a full-width horizontal banner.
2. Give submitted attempts an explicit **Xem lại** action and keep **Tiếp tục** for in-progress attempts.
3. Make both actions readable, aligned, and touch-friendly at every supported viewport.
4. Replace the floating back button with contextual top navigation that always returns to the correct parent page.

The design keeps the existing teal and peach palette, soft corners, Vietnamese typography, and low-motion product UI.

## Information Architecture

The student course page will use this order:

1. Student header
2. Course overview hero
3. Full-width mock exam banner
4. Compact study-tip strip
5. **Luyện theo chương** heading and full-width chapter list
6. Recent attempts

The former desktop right sidebar is removed. The chapter list therefore receives the full content width and no longer compresses long Vietnamese chapter titles.

## Mock Exam Banner

### Desktop and tablet

The banner is a three-part horizontal composition:

- Left: target icon, eyebrow, title, and short description.
- Middle: two concise facts, **40 câu** and **60 phút**.
- Right: primary **Bắt đầu thi thử** action.

The action has a stable minimum width and stays vertically centered. The content area may wrap before the button is compressed.

### Mobile

At narrow widths, the banner becomes a single column:

- Icon and text first.
- Exam facts on one wrapping row.
- Full-width action last.

No horizontal scrolling is allowed. Text wrapping must not reduce the action below a 44-pixel touch target.

### Study tip

The existing **Mẹo ôn tập** content remains directly below the banner as a slim, full-width peach strip. It is supporting guidance, not a competing card.

## Chapter and Attempt Layout

The chapter accordion remains the main interaction model. Opening a chapter shows its attempt history.

Each attempt row has five semantic areas:

1. Attempt icon and identity/date
2. Status badge
3. Score, when available
4. Contextual action
5. Delete action

### Action rules

- `submitted`: show score as non-interactive text and show a labeled **Xem lại** link to `/results/{attemptId}`.
- `in_progress`: show a labeled **Tiếp tục** link to the exact saved attempt.
- `expired`: show neither action unless an existing supported review result is available.
- Delete remains a separate icon button and must never occupy the same click target as **Xem lại** or **Tiếp tục**.

The same terms are used in the chapter accordion, recent-attempt list, and full history page. **Xem kết quả** is standardized to **Xem lại** for submitted attempts.

## Responsive Action Behavior

### Wide screens

- Score and action are separate columns.
- **Tiếp tục** and **Xem lại** share the same height, padding, font weight, icon size, and visual emphasis.
- Delete stays at the far edge.

### Medium screens

- Metadata can wrap into a second row.
- The action group remains aligned to the end and never overlaps the score or delete button.

### Small screens

- Attempt identity and status occupy the first content row.
- Score appears as readable text instead of being hidden.
- **Tiếp tục** or **Xem lại** moves to a dedicated action row and expands to the available width.
- Delete remains a square secondary control with at least a 44-by-44-pixel target.
- Labels do not truncate and the row does not create horizontal overflow.

## Back Navigation

The fixed circular `.global-back-button` is removed. It currently overlaps mobile navigation and duplicates page-specific navigation.

A reusable inline back link is placed at the top of the relevant content/header area. It contains an arrow plus a visible Vietnamese label. Navigation is deterministic and does not call `router.back()`.

Parent-route rules:

| Current context | Back destination | Label |
| --- | --- | --- |
| Course overview | `/dashboard` | Về tổng quan |
| Chapter practice | `/courses/{courseSlug}` | Về học phần |
| Mock exam setup/session | `/courses/{courseSlug}` | Về học phần |
| Submitted result review | `/history` | Về lịch sử |
| Student history | `/dashboard` | Về tổng quan |
| Admin child page | `/admin` | Về trang quản trị |
| Lecturer child page | `/lecturer` | Về trang giảng viên |

Portal roots, dashboard, authentication pages, and the landing page do not show an extra back link.

If a session page already has a contextual top link, that link is updated instead of adding a duplicate.

## Accessibility and Interaction

- All action links use visible text; score alone is never the only indication that review is available.
- Interactive targets are at least 44 pixels high on touch layouts.
- Focus-visible states remain clearly visible against teal, white, and peach surfaces.
- Decorative icons use `aria-hidden`; icon-only delete controls retain specific accessible labels.
- Expanded chapter content remains keyboard reachable through the native `details/summary` interaction.
- Reduced-motion preferences are respected; this change adds no required animation.

## Data and Routing

No database migration is required. Existing attempt IDs, status values, result pages, and resume URLs are reused.

The change is primarily structural JSX and CSS. Navigation destinations are explicit links derived from existing route data; no browser-history state is required.

## Verification

Implementation must verify:

1. Mock exam banner appears above **Luyện theo chương** and the chapter list is full width.
2. Banner and tip strip have no overflow at desktop, tablet, and mobile widths.
3. Every submitted chapter attempt exposes **Xem lại** and opens the matching immutable result.
4. Every in-progress attempt exposes **Tiếp tục** and opens the matching saved attempt.
5. Score remains visible and non-interactive beside **Xem lại**.
6. Actions and delete controls do not overlap at narrow widths.
7. Top back links resolve to the specified parent route even after a direct URL visit or browser refresh.
8. The former fixed back button no longer covers the mobile question navigator.
9. Existing role separation and route protection remain unchanged.
10. Lint, type checking, targeted component tests, and the production build pass.

## Out of Scope

- Changing mock-exam question selection or timing.
- Changing attempt scoring, submission, or deletion behavior.
- Redesigning administrator or lecturer portal content beyond the shared back-link placement.
- Changing the established product color palette or typography system.
