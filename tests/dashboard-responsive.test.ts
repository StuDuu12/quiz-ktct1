import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ChapterRow } from "@/src/features/catalog/components/chapter-row";
import type { ChapterSummary } from "@/src/features/catalog/queries";

describe("learner dashboard responsive chapter geometry", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it("keeps every chapter action inside the row and its text visible at supported widths", async () => {
    const styles = await readFile(path.resolve("app/globals.css"), "utf8");
    const chapter = {
      id: "chapter-1",
      position: 1,
      title: "Hàng hóa, thị trường và vai trò của các chủ thể",
      questionCount: 84,
      attempts: 3,
      accuracy: 75,
      latestAttemptAt: "2026-07-30T08:00:00.000Z",
      activeAttemptId: null,
    } as ChapterSummary;
    const row = renderToStaticMarkup(
      createElement(ChapterRow, { chapter, courseSlug: "ktct" }),
    );
    const page = await browser.newPage();

    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(`
        <style>${styles}</style>
        <main class="learner-shell">
          <div class="chapter-list">${row}</div>
        </main>
      `);

      const rowBox = await page.locator(".chapter-row").boundingBox();
      const bodyBox = await page.locator(".chapter-body").boundingBox();
      const action = page.locator(".practice-link");
      const actionBox = await action.boundingBox();

      expect(rowBox, `${width}px row`).not.toBeNull();
      expect(bodyBox, `${width}px body`).not.toBeNull();
      expect(actionBox, `${width}px action`).not.toBeNull();
      expect(actionBox!.x, `${width}px action x`).toBeGreaterThan(bodyBox!.x);
      expect(actionBox!.y, `${width}px action y`).toBeLessThanOrEqual(
        rowBox!.y + rowBox!.height,
      );
      expect(actionBox!.width, `${width}px action width`).toBeGreaterThanOrEqual(
        44,
      );

      if (width === 375) {
        const textIsVisible = await action.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            element.textContent?.includes("Luyện tập") === true &&
            Number.parseFloat(style.fontSize) > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        });
        expect(textIsVisible).toBe(true);
      }
    }

    await page.close();
  });
});
