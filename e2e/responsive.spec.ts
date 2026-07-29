import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, loginAs, resetE2E } from "./helpers";

const viewports = [375, 768, 1024, 1440] as const;

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

for (const width of viewports) {
  test(`learner dashboard geometry is safe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, "student");
    await expectNoHorizontalOverflow(page);

    for (const cta of await page.locator(".chapter-row .practice-link").all()) {
      const box = await cta.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      const row = cta.locator("xpath=ancestor::*[contains(@class,'chapter-row')]");
      const rowBox = await row.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        rowBox!.x + rowBox!.width + 0.5,
      );
    }

    if (width < 768) {
      const bodySize = await page.locator("body").evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
      expect(bodySize).toBeGreaterThanOrEqual(16);
    }
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
