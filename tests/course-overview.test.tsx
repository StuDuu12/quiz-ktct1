// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CourseOverview } from "@/src/features/catalog/components/course-overview";
import type { CourseDashboard } from "@/src/features/catalog/queries";

afterEach(cleanup);

const dashboard: CourseDashboard = {
  course: {
    id: "course-1",
    slug: "kinh-te-chinh-tri-mac-lenin",
    title: "Kinh tế chính trị Mác – Lênin",
    description: "",
  },
  chapters: [],
  recentAttempts: [],
  overallProgress: null,
  questionCount: 0,
  mockExamAvailable: true,
};

describe("CourseOverview", () => {
  it("shows an administrator a link to the administration portal", () => {
    render(<CourseOverview dashboard={dashboard} viewerRole="admin" />);

    expect(
      screen.getByRole("link", { name: "Trang quản trị" }),
    ).toHaveAttribute("href", "/admin");
  });

  it("does not show a student a link to the administration portal", () => {
    render(<CourseOverview dashboard={dashboard} viewerRole="student" />);

    expect(
      screen.queryByRole("link", { name: "Trang quản trị" }),
    ).toBeNull();
  });

  it("shows an active mock-exam launch link only when a valid config exists", () => {
    const { rerender } = render(
      <CourseOverview
        dashboard={{ ...dashboard, mockExamAvailable: false }}
        viewerRole="student"
      />,
    );

    expect(
      screen.queryByRole("link", { name: /bắt đầu thi thử/i }),
    ).toBeNull();
    expect(
      screen.getByText("Thi thử chưa được cấu hình"),
    ).toBeVisible();

    rerender(
      <CourseOverview
        dashboard={{ ...dashboard, mockExamAvailable: true }}
        viewerRole="student"
      />,
    );

    expect(
      screen.getByRole("link", { name: /bắt đầu thi thử/i }),
    ).toHaveAttribute(
      "href",
      "/courses/kinh-te-chinh-tri-mac-lenin/mock-exam",
    );
  });
});
