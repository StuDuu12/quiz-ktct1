import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  loginAs,
  resetE2E,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetE2E(request);
});

test("practice gives immediate feedback and restores a saved flag after reload", async ({
  page,
}) => {
  await loginAs(page, "student");
  await page.goto(
    "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
    { waitUntil: "networkidle" },
  );
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();
  await expect(page).toHaveURL(/attempt=e2e-practice-/);

  const radios = page.locator('input[type="radio"][name="practice-answer"]');
  await expect(radios).toHaveCount(4);
  const firstRadio = radios.first();
  await firstRadio.focus();
  await expect
    .poll(() =>
      firstRadio.evaluate((element) =>
        getComputedStyle(element.closest("label")!).outlineStyle,
      ),
    )
    .toBe("solid");
  for (const radio of await radios.all()) {
    const box = await radio.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel("Phương án B").check();
  await expect(page.getByText("Chính xác", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Giá trị hàng hóa được quyết định bởi thời gian lao động xã hội cần thiết.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Đặt cờ" }).click();
  await expect(
    page.getByRole("button", { name: "Đã đặt cờ" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByLabel("Phương án B")).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Đã đặt cờ" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("practice navigator is an accessible bottom sheet on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, "student");
  await page.goto(
    "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
    { waitUntil: "networkidle" },
  );
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();
  await expectNoHorizontalOverflow(page);

  const trigger = page.getByRole("button", { name: /Danh sách câu/ });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const sheet = page.getByRole("dialog", {
    name: "Danh sách câu hỏi trên thiết bị di động",
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Đóng danh sách câu hỏi" }))
    .toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.locator(".practice-option").first().evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    )
    .toBe("0s");

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(trigger).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(page.locator(".practice-navigator-panel")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("practice shortcuts do not fire while an editable field has focus", async ({
  page,
}) => {
  await loginAs(page, "student");
  await page.goto(
    "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
    { waitUntil: "networkidle" },
  );
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();

  const editor = page.getByRole("textbox", {
    name: "Kiểm tra phím tắt khi nhập",
  });
  await editor.fill("ghi chú ");
  await editor.pressSequentially("1234f");
  await editor.press("ArrowRight");
  await editor.press("ArrowLeft");

  await expect(editor).toHaveValue("ghi chú 1234f");
  await expect(
    page.locator('input[type="radio"][name="practice-answer"]:checked'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Đặt cờ\s*F?$/ }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Câu 1 / 10")).toBeVisible();
});

test("practice reviews, finishes, and appears in history", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto(
    "/courses/kinh-te-chinh-tri-mac-lenin/chapters/1/practice",
  );
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Bắt đầu luyện tập" }).click();
  await expect(page).toHaveURL(/attempt=e2e-practice-/);
  const attemptUrl = page.url();
  await page.getByLabel(/Phương án B/).check();
  await page.getByRole("button", { name: "Đặt cờ" }).click();
  await page.reload();
  await expect(page).toHaveURL(attemptUrl);
  await page.getByRole("button", { name: "Kết thúc" }).first().click();
  await page.getByRole("button", { name: "Xác nhận hoàn thành" }).click();
  await expect(
    page.getByRole("heading", { name: "Lượt luyện tập đã được lưu" }),
  ).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("Luyện tập theo chương").first()).toBeVisible();
});
