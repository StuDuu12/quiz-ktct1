import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/auth/auth-watcher", () => ({
  AuthWatcher: () => null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import RootLayout from "@/app/layout";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) {
      throw new Error(`Unsupported computed color: ${color}`);
    }
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (
    (Math.max(first, second) + 0.05) /
    (Math.min(first, second) + 0.05)
  );
}

describe("Vietnamese typography", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it("declares Vietnamese language at the root without runtime font classes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        RootLayout,
        null,
        React.createElement("main", null, "Nội dung"),
      ),
    );

    expect(markup).toContain('<html lang="vi">');
    expect(markup).toContain("<body>");
    expect(markup).not.toContain("_selfHostedCSS");
  });

  it("keeps mobile forms, questions, answers, and main actions readable", async () => {
    const styles = await readFile(path.resolve("app/globals.css"), "utf8");
    const page = await browser.newPage({
      viewport: { width: 375, height: 900 },
    });

    await page.setContent(`
      <style>${styles}</style>
      <main>
        <form class="auth-form">
          <label><span>Mật khẩu</span><input value="mật khẩu"></label>
          <button class="auth-submit">Đăng nhập</button>
        </form>
        <article class="practice-question-card">
          <h1>Nội dung câu hỏi luyện tập</h1>
          <button class="practice-option"><span class="option-label">Phương án luyện tập</span></button>
          <footer class="question-actions"><button>Tiếp theo</button></footer>
        </article>
        <article class="exam-question-card">
          <h1>Nội dung câu hỏi thi thử</h1>
          <button class="exam-option"><span class="exam-option-content">Phương án thi thử</span></button>
          <div class="exam-question-actions"><button>Tiếp theo</button></div>
        </article>
        <button class="admin-primary-button">Lưu thay đổi</button>
      </main>
    `);

    for (const selector of [
      ".auth-form input",
      ".auth-submit",
      ".practice-question-card > h1",
      ".option-label",
      ".question-actions button",
      ".exam-question-card > h1",
      ".exam-option-content",
      ".exam-question-actions button",
      ".admin-primary-button",
    ]) {
      const metrics = await page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(metrics.fontSize, selector).toBeGreaterThanOrEqual(16);
      expect(metrics.lineHeight, selector).toBeGreaterThanOrEqual(24);
    }

    await page.close();
  });

  it("uses only available font weights and restrained Vietnamese heading tracking", async () => {
    const styles = await readFile(path.resolve("app/globals.css"), "utf8");
    const page = await browser.newPage();

    await page.setContent(`
      <html style="--font-be-vietnam-pro: 'Be Vietnam Pro'">
        <head><style>${styles}</style></head>
        <body>
          <section class="auth-card"><h1>Đăng nhập</h1></section>
          <section class="course-hero"><h1>Học phần</h1></section>
          <section class="admin-page-header"><h1>Quản trị</h1></section>
        </body>
      </html>
    `);

    const bodyFamily = await page.locator("body").evaluate(
      (element) => getComputedStyle(element).fontFamily,
    );
    expect(bodyFamily).toContain("Be Vietnam Pro");

    for (const selector of [
      ".auth-card h1",
      ".course-hero h1",
      ".admin-page-header h1",
    ]) {
      const typography = await page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontWeight: Number.parseInt(style.fontWeight, 10),
          letterSpacing: Number.parseFloat(style.letterSpacing),
          fontSize: Number.parseFloat(style.fontSize),
        };
      });
      expect([400, 500, 600, 700, 800], selector).toContain(
        typography.fontWeight,
      );
      expect(
        typography.letterSpacing / typography.fontSize,
        selector,
      ).toBeGreaterThanOrEqual(-0.02);
    }

    await page.close();
  });

  it("keeps dark landing navigation and CTAs readable for hover and keyboard focus", async () => {
    const styles = await readFile(
      path.resolve("src/features/public/landing-page.module.css"),
      "utf8",
    );
    const page = await browser.newPage({
      viewport: { width: 1024, height: 800 },
      colorScheme: "dark",
    });
    await page.setContent(`
      <style>${styles}</style>
      <main class="page">
        <header class="header">
          <nav class="navigation">
            <a class="sectionLink" href="#gioi-thieu">Giới thiệu</a>
            <a class="loginLink" href="/login">Đăng nhập</a>
          </nav>
        </header>
        <section class="hero">
          <div class="heroActions">
            <a class="primaryAction" href="/login">Đăng nhập</a>
          </div>
        </section>
      </main>
    `);

    async function expectContrast(selector: string) {
      const colors = await page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          foreground: style.color,
          background: style.backgroundColor,
        };
      });
      expect(
        contrastRatio(colors.foreground, colors.background),
        `${selector}: ${colors.foreground} on ${colors.background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    await expectContrast(".loginLink");
    await expectContrast(".primaryAction");

    await page.locator(".sectionLink").hover();
    await expectContrast(".sectionLink");

    await page.locator(".sectionLink").focus();
    expect(
      await page.locator(".sectionLink").evaluate((element) =>
        element.matches(":focus-visible"),
      ),
    ).toBe(true);
    await expectContrast(".sectionLink");

    await page.locator(".loginLink").focus();
    expect(
      await page.locator(".loginLink").evaluate((element) =>
        element.matches(":focus-visible"),
      ),
    ).toBe(true);
    await expectContrast(".loginLink");

    await page.close();
  });
});
