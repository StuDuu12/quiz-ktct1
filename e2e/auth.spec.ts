import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/e2e/reset");
  expect(response.ok()).toBe(true);
});

test("student registers, confirms email, signs in, and restores the session after reload", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Họ và tên").fill("Nguyễn An");
  await page.getByLabel("Email").fill("an.student@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("HocTap!2026");
  await page.getByLabel("Xác nhận mật khẩu").fill("HocTap!2026");
  await page.getByRole("checkbox", { name: /đồng ý với điều khoản/i }).check();
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Đăng ký thành công" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Xác minh email thử nghiệm" })
    .click();

  await expect(page).toHaveURL(/\/login\?confirmed=1$/);
  await page.getByLabel("Email").fill("an.student@example.test");
  await page.getByLabel("Mật khẩu").fill("HocTap!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", {
      name: "Kinh tế chính trị Mác – Lênin",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", {
      name: "Kinh tế chính trị Mác – Lênin",
    }),
  ).toBeVisible();
});
