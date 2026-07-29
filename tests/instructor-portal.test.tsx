// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAdminCatalog, getAdminQuestions, getAdminReport, requireViewer } = vi.hoisted(() => ({
  getAdminCatalog: vi.fn(),
  getAdminQuestions: vi.fn(),
  getAdminReport: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("@/src/features/admin/queries", () => ({
  getAdminCatalog,
  getAdminQuestions,
  getAdminReport,
}));
vi.mock("@/src/features/auth/session", () => ({ requireViewer }));

import AdminDashboardPage from "@/app/(admin)/admin/page";
import AdminQuestionsPage from "@/app/(admin)/admin/questions/page";

afterEach(cleanup);

describe("instructor portal", () => {
  it("has an instructor-only layout", () => {
    const instructorLayoutSource = readFileSync(
      resolve("app/(instructor)/instructor/layout.tsx"),
      "utf8",
    );

    expect(instructorLayoutSource).toContain('requireViewer(["instructor"])');
  });

  it("does not include administration-only destinations", () => {
    const instructorNavigation = readFileSync(
      resolve("src/features/instructor/components/instructor-navigation.tsx"),
      "utf8",
    );

    expect(instructorNavigation).not.toContain("Người dùng");
    expect(instructorNavigation).not.toContain("Nhật ký hệ thống");
  });

  it("does not prefetch every authenticated portal route in parallel", () => {
    const instructorNavigation = readFileSync(
      resolve("src/features/instructor/components/instructor-navigation.tsx"),
      "utf8",
    );
    const adminNavigation = readFileSync(
      resolve("src/features/admin/components/admin-navigation.tsx"),
      "utf8",
    );

    expect(instructorNavigation).toContain("prefetch={false}");
    expect(adminNavigation).toContain("prefetch={false}");
  });

  it("keeps instructor dashboard links inside the instructor portal", async () => {
    requireViewer.mockResolvedValue({
      id: "instructor-1",
      role: "instructor",
      email: "instructor@example.test",
    });
    getAdminCatalog.mockResolvedValue({ courses: [], chapters: [], importJobs: [] });
    getAdminReport.mockResolvedValue({
      summary: {
        activeUsers: 0,
        attempts: 0,
        averageScore: null,
        completionRate: 0,
      },
      chapterDifficulty: [],
    });

    render(await AdminDashboardPage());

    expect(
      screen.getByRole("link", { name: "Thêm câu hỏi" }),
    ).toHaveAttribute("href", "/instructor/questions");
    expect(screen.getByRole("link", { name: "Xem báo cáo" })).toHaveAttribute(
      "href",
      "/instructor/reports",
    );
    expect(
      screen.getByRole("link", { name: "Quản lý nội dung" }),
    ).toHaveAttribute("href", "/instructor/courses");
  });

  it("keeps the instructor question-bank import action inside the instructor portal", async () => {
    requireViewer.mockResolvedValue({
      id: "instructor-1",
      role: "instructor",
      email: "instructor@example.test",
    });
    getAdminCatalog.mockResolvedValue({ courses: [], chapters: [], importJobs: [] });
    getAdminQuestions.mockResolvedValue([]);

    render(await AdminQuestionsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("link", { name: "Nhập Markdown" }),
    ).toHaveAttribute("href", "/instructor/import");
  });
});
