import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses/ktct",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ChapterRow } from "@/src/features/catalog/components/chapter-row";
import { CourseOverview } from "@/src/features/catalog/components/course-overview";
import type {
  ChapterSummary,
  CourseDashboard,
} from "@/src/features/catalog/queries";

const chapter: ChapterSummary = {
  id: "chapter-1",
  position: 1,
  title: "Đối tượng, phương pháp và chức năng của kinh tế chính trị",
  questionCount: 49,
  attempts: 1,
  accuracy: 95,
  latestAttemptAt: "2026-08-02T08:00:00.000Z",
  activeAttemptId: "active-1",
  history: [
    {
      id: "submitted-1",
      score: 95,
      submittedAt: "2026-08-02T08:00:00.000Z",
      status: "submitted",
    },
    {
      id: "active-1",
      score: null,
      submittedAt: "2026-08-02T09:00:00.000Z",
      status: "in_progress",
    },
  ],
};

const dashboard: CourseDashboard = {
  course: {
    id: "course-1",
    slug: "ktct",
    title: "Kinh tế chính trị Mác – Lênin",
    description: "Ngân hàng câu hỏi gồm sáu chương.",
  },
  chapters: [],
  recentAttempts: [],
  overallProgress: 95,
  questionCount: 497,
  mockExamAvailable: true,
};

describe("course actions responsive geometry", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it("keeps review, resume, score, delete, and mock actions visible at supported widths", async () => {
    const styles = await readFile(path.resolve("app/globals.css"), "utf8");
    const overview = renderToStaticMarkup(
      createElement(CourseOverview, { dashboard, viewerRole: "student" }),
    );
    const chapterMarkup = renderToStaticMarkup(
      createElement(ChapterRow, { chapter, courseSlug: "ktct" }),
    );
    const page = await browser.newPage();

    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`
        <style>${styles}</style>
        ${overview}
        <main class="learner-shell">
          <div class="chapter-list">${chapterMarkup}</div>
        </main>
      `);
      await page.locator("details").evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });

      const submitted = page.locator(".attempt-row").filter({ hasText: "Xem lại" });
      const active = page.locator(".attempt-row").filter({ hasText: "Tiếp tục" });
      const reviewBox = await submitted.getByRole("link", { name: "Xem lại" }).boundingBox();
      const resumeBox = await active.getByRole("link", { name: "Tiếp tục" }).boundingBox();
      const deleteBox = await submitted.getByRole("button", { name: "Xoá lượt làm" }).boundingBox();
      const scoreBox = await submitted.locator(".attempt-score").boundingBox();

      expect(reviewBox, `${width}px review`).not.toBeNull();
      expect(resumeBox, `${width}px resume`).not.toBeNull();
      expect(deleteBox, `${width}px delete`).not.toBeNull();
      expect(scoreBox, `${width}px score`).not.toBeNull();
      expect(reviewBox!.width, `${width}px review width`).toBeGreaterThanOrEqual(44);
      expect(resumeBox!.width, `${width}px resume width`).toBeGreaterThanOrEqual(44);
      expect(deleteBox!.width, `${width}px delete width`).toBeGreaterThanOrEqual(44);
      expect(scoreBox!.width, `${width}px score width`).toBeGreaterThan(0);
      expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(width);
      expect(resumeBox!.x + resumeBox!.width).toBeLessThanOrEqual(width);

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasOverflow, `${width}px horizontal overflow`).toBe(false);

      if (width === 375) {
        const bannerActionBox = await page.locator(".mock-banner-action").boundingBox();
        const mockCtaBox = await page.getByRole("link", { name: /bắt đầu thi thử/i }).boundingBox();
        expect(bannerActionBox).not.toBeNull();
        expect(mockCtaBox).not.toBeNull();
        expect(Math.abs(mockCtaBox!.width - bannerActionBox!.width)).toBeLessThanOrEqual(1);
      }
    }

    await page.close();
  }, 30_000);
});
