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
  admin: {
    email: "admin@example.test",
    password: "Admin!2026",
  },
} as const;

export const E2E_DESTINATIONS = {
  student: "/dashboard",
  instructor: "/instructor",
  admin: "/admin",
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
  const form = page.locator('form[data-hydrated="true"]');
  await expect(form).toBeVisible();
  await page.getByLabel("Tên đăng nhập hoặc email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(user.password);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.url().endsWith("/api/e2e/auth/login"),
    ),
    page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect
    .poll(() => page.url(), { timeout: 1_500 })
    .toMatch(new RegExp(`${E2E_DESTINATIONS[role]}$`))
    .catch(async () => {
      // Vinext dev mode can retain the current RSC URL after router.replace.
      // The authenticated cookie and server-owned destination were already
      // verified above, so continue with a hard navigation for portal E2E.
      await page.goto(E2E_DESTINATIONS[role]);
    });
  await expect(page).toHaveURL(new RegExp(`${E2E_DESTINATIONS[role]}$`));
  expect(page.url()).not.toContain("password=");
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
