import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const E2E_USERS = {
  student: {
    email: "student@example.test",
    password: "Student!2026",
  },
  instructor: {
    email: "instructor@example.test",
    password: "Instructor!2026",
  },
} as const;

export async function resetE2E(request: APIRequestContext) {
  const response = await request.post("/api/e2e/reset");
  expect(response.ok()).toBe(true);
}

export async function loginAs(
  page: Page,
  role: keyof typeof E2E_USERS,
) {
  const user = E2E_USERS[role];
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(user.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}
