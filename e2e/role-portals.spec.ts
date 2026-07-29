import { expect, test } from "@playwright/test";

import { loginAs, resetE2E } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

test("each fixture role reaches only its server-owned portal", async ({ page }) => {
  await loginAs(page, "student");
  await expect(page.getByRole("heading", {
    name: "Kinh tế chính trị Mác – Lênin",
  })).toBeVisible();
  expect(await page.goto("/admin/users")).not.toBeNull();
  await expect(page.getByRole("heading", {
    name: "Người dùng và phân quyền",
  })).toHaveCount(0);

  await page.context().clearCookies();
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, "instructor");
  await expect(page.locator('.admin-shell[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("navigation", {
    name: "Điều hướng giảng viên",
  })).toBeVisible();
  await page.getByRole("button", {
    name: "Mở điều hướng giảng viên",
  }).click();
  await expect(page.getByRole("button", {
    name: "Đóng điều hướng",
  })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", {
    name: "Đóng điều hướng",
  })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", {
    name: "Người dùng và phân quyền",
  })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, "admin");
  await expect(page.locator('.admin-shell[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("navigation", {
    name: "Điều hướng quản trị",
  })).toBeVisible();
});

test("administrator can deliberately switch to learner view and back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, "admin");
  await expect(page.locator('.admin-shell[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", {
    name: "Mở điều hướng quản trị",
  }).click();
  await expect(page.getByRole("button", {
    name: "Đóng điều hướng",
  })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", {
    name: "Đóng điều hướng",
  })).toHaveCount(0);
  await page.getByRole("button", {
    name: "Mở điều hướng quản trị",
  }).click();
  await expect(page.getByRole("button", {
    name: "Đóng điều hướng",
  })).toBeVisible();
  await page.getByRole("link", { name: "Về trang học" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const back = page.getByRole("link", { name: "Trang quản trị" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/admin$/);
});
