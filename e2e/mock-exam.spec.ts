import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  loginAs,
  resetE2E,
} from "./helpers";

const launchPath =
  "/courses/kinh-te-chinh-tri-mac-lenin/mock-exam";

async function startExam(page: Parameters<typeof loginAs>[0]) {
  await page.goto(launchPath);
  await page.locator('[data-hydrated="true"]').waitFor({ state: "attached" });
  await page
    .getByRole("button", { name: /Bắt đầu thi thử/ })
    .click();
  await expect(page).toHaveURL(/\/exam\/e2e-exam-/);
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

test("student reviews the authoritative snapshot before submitting", async ({
  page,
}) => {
  await loginAs(page, "student");
  await startExam(page);

  await expect(
    page.locator('input[type="radio"][name="exam-answer"]'),
  ).toHaveCount(4);
  await page.getByLabel("Phương án A").check();
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Rà soát và nộp bài" })
    .click();

  const review = page.getByRole("dialog", {
    name: "Rà soát trước khi nộp bài",
  });
  await expect(review.getByText("39 câu chưa trả lời")).toBeVisible();
  await review
    .getByRole("button", { name: "Quay lại làm bài" })
    .click();
  await expect(page.getByText("Câu 1 / 40")).toBeVisible();

  await page
    .getByRole("button", { name: "Rà soát và nộp bài" })
    .click();
  await review
    .getByRole("button", { name: "Xác nhận nộp bài" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bài thi đã được nộp" }),
  ).toBeVisible();
});

test("expired exam auto-submits the latest server-persisted answers", async ({
  page,
  request,
}) => {
  await loginAs(page, "student");
  await startExam(page);
  await page.getByLabel("Phương án A").check();
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
  const attemptId = new URL(page.url()).pathname.split("/").at(-1)!;

  const expired = await request.post(
    `/api/e2e/attempts/${attemptId}/expire`,
  );
  expect(expired.ok()).toBe(true);
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Bài thi đã được nộp" }),
  ).toBeVisible();
});

test("mock navigator is a keyboard-safe bottom sheet without phone overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, "student");
  await startExam(page);
  await expectNoHorizontalOverflow(page);

  const trigger = page.getByRole("button", { name: /Danh sách câu/ });
  await trigger.click();
  const sheet = page.getByRole("dialog", {
    name: "Danh sách câu hỏi trên thiết bị di động",
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Đóng danh sách câu hỏi" }))
    .toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(trigger).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectNoHorizontalOverflow(page);
});
