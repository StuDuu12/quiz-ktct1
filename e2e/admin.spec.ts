import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  loginAs,
  resetE2E,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

test("student is denied the administration surface without data disclosure", async ({
  page,
}) => {
  await loginAs(page, "student");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?access=denied$/);
  await expect(
    page.getByRole("heading", {
      name: "Kinh tế chính trị Mác – Lênin",
    }),
  ).toBeVisible();
  await expect(page.getByText("TRUNG TÂM ĐIỀU HÀNH")).toHaveCount(0);
});

test("instructor sees only the assigned course across responsive widths", async ({
  page,
}) => {
  await loginAs(page, "instructor");
  await page.goto("/admin/courses");

  await expect(
    page.getByRole("heading", { name: "Khóa học và chương" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Kinh tế chính trị Mác – Lênin",
    }),
  ).toBeVisible();
  await expect(page.getByText("Khóa ngoài phạm vi")).toHaveCount(0);

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }
});
