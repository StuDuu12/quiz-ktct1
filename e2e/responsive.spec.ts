import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoHorizontalOverflow, loginAs, resetE2E } from "./helpers";

const viewports = [375, 768, 1024, 1440] as const;

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

async function expectKeyCtaGeometry(page: Page, cta: Locator) {
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    (await page.evaluate(() => innerWidth)) + 0.5,
  );
}

async function expectVisibleNavigationDoesNotOverlap(page: Page) {
  const boxes = await page.locator("nav a, nav button").evaluateAll((items) =>
    items.flatMap((item) => {
      const box = item.getBoundingClientRect();
      return box.width >= 8 &&
        box.height >= 8 &&
        box.right > 0 &&
        box.left < window.innerWidth &&
        box.bottom > 0 &&
        box.top < window.innerHeight
        ? [{ x: box.x, y: box.y, width: box.width, height: box.height }]
        : [];
    }),
  );
  const viewportWidth = await page.evaluate(() => innerWidth);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 0.5);
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]!;
      const b = boxes[right]!;
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) -
        Math.max(a.x, b.x);
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) -
        Math.max(a.y, b.y);
      expect(Math.max(0, overlapWidth) * Math.max(0, overlapHeight)).toBe(0);
    }
  }
}

async function expectSurface(page: Page, cta: Locator) {
  await expectNoHorizontalOverflow(page);
  await expectVisibleNavigationDoesNotOverlap(page);
  await expectKeyCtaGeometry(page, cta);
}

async function expectFontAtLeast16(locator: Locator) {
  await expect(locator).toBeVisible();
  const size = await locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(16);
}

for (const width of viewports) {
  test(`release surface matrix is safe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/");
    await expectSurface(
      page,
      page.locator('#gioi-thieu a[href="/login"]'),
    );

    await page.goto("/login");
    await expectSurface(
      page,
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    );
    if (width <= 768) {
      await expectFontAtLeast16(
        page.getByLabel("Tên đăng nhập hoặc email"),
      );
    }

    await page.goto("/register");
    await expectSurface(
      page,
      page.getByRole("button", { name: "Đăng ký", exact: true }),
    );
    if (width <= 768) {
      await expectFontAtLeast16(page.getByLabel("Email"));
    }

    await loginAs(page, "student");
    await expectSurface(page, page.locator(".chapter-row .practice-link").first());

    await page.goto("/history");
    await expectSurface(
      page,
      page.locator(".history-filter-actions button"),
    );
    if (width <= 768) {
      await expectFontAtLeast16(page.locator(".history-filters input").first());
      await expectFontAtLeast16(page.locator(".history-filters select").first());
    }

    await page.goto(
      "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
    );
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();
    await expect(page).toHaveURL(/attempt=e2e-practice-/);
    await expectSurface(page, page.locator(".question-actions button:visible").last());
    if (width <= 768) {
      await expectFontAtLeast16(page.locator(".option-label").first());
    }

    await page.goto(
      "/courses/kinh-te-chinh-tri-mac-lenin/mock-exam",
      { waitUntil: "networkidle" },
    );
    await page.locator('form[data-hydrated="true"]').waitFor();
    await page.getByRole("button", { name: /Bắt đầu thi thử/ }).click();
    await expect(page).toHaveURL(/\/exam\/e2e-exam-/);
    await expectSurface(page, page.locator(".exam-review-trigger"));
    if (width <= 768) {
      await expectFontAtLeast16(page.locator(".exam-option-content").first());
    }

    await page.context().clearCookies();
    await loginAs(page, "instructor");
    await expectSurface(page, page.locator(".admin-header-action"));

    await page.context().clearCookies();
    await loginAs(page, "admin");
    await expectSurface(page, page.locator(".admin-header-action"));
  });
}

test("practice uses a drawer below 1024 and a sidebar from 1024", async ({
  page,
}) => {
  await loginAs(page, "student");
  await page.goto(
    "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
  );
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();
  await expect(page).toHaveURL(/attempt=e2e-practice-/);

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
    const trigger = page.getByRole("button", { name: /Danh sách câu/ });
    const sidebar = page.locator(".practice-navigator-panel");
    if (width < 1024) {
      await expect(trigger).toBeVisible();
      await expect(sidebar).toBeHidden();
      expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(trigger).toBeHidden();
      await expect(sidebar).toBeVisible();
    }
  }
});
