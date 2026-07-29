import { expect, test } from "@playwright/test";

import { loginAs, resetE2E } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

test("instructor edits an assigned draft and is denied outside the assignment", async ({
  page,
}) => {
  await loginAs(page, "instructor");
  await page.goto("/instructor/questions");
  await expect(page.locator('.admin-shell[data-hydrated="true"]')).toBeVisible();

  const editor = page.locator("details").filter({
    hasText: "Chỉnh sửa câu 501",
  });
  await page.getByText("Chỉnh sửa câu 501", { exact: true }).click();
  const content = editor.getByLabel("Nội dung");
  await content.fill("Câu hỏi bản nháp đã được giảng viên cập nhật");
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      response.url().includes("/instructor/questions"),
    ),
    editor.getByRole("button", { name: "Lưu phiên bản mới" }).click(),
  ]);
  expect(saveResponse.ok()).toBe(true);
  await editor.evaluate((element) => element.removeAttribute("open"));
  await page.reload();
  await expect(page.locator(".admin-table strong").filter({
    hasText: "Câu hỏi bản nháp đã được giảng viên cập nhật",
  })).toBeVisible();

  const denial = await page.evaluate(async () => {
    const response = await fetch("/api/e2e/instructor/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chapterId: "e2e-unassigned-chapter-1",
        content: "Không được phép lưu",
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(denial).toEqual({ status: 403, body: { error: "FORBIDDEN" } });
});

test("admin role and active mutations are reversible and audited", async ({
  page,
}) => {
  await loginAs(page, "admin");
  await page.goto("/admin/users");

  const student = page.locator(".admin-user-list article").filter({
    hasText: "student@example.test",
  });
  await student.getByText("Quyền và phân công", { exact: true }).click();
  const role = student.getByRole("combobox", { name: /Vai trò cho/ });
  await role.selectOption("instructor");
  await student.getByRole("button", { name: "Cập nhật vai trò" }).click();
  await expect(student.getByRole("status")).toHaveText("Đã cập nhật vai trò.");

  await role.selectOption("student");
  await student.getByRole("button", { name: "Cập nhật vai trò" }).click();
  await expect(student.getByRole("status")).toHaveText("Đã cập nhật vai trò.");

  await student.getByRole("button", { name: "Khóa tài khoản" }).click();
  await expect(student.getByText("Đã khóa", { exact: true })).toBeVisible();
  await student.getByRole("button", { name: "Mở lại tài khoản" }).click();
  await expect(student.getByText("Hoạt động", { exact: true })).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByText("profile.role_changed").first()).toBeVisible();
  await expect(page.getByText("Khóa tài khoản").first()).toBeVisible();
  await expect(page.getByText("Mở tài khoản").first()).toBeVisible();
});
