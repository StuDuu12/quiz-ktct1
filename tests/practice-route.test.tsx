// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  finishPractice,
  getPracticeChapterById,
  getPracticeChapterByRoute,
  loadPracticeSession,
  savePracticeAnswer,
  savePracticeFlag,
  startOrResumePracticeForRoute,
  startPractice,
} = vi.hoisted(() => ({
  finishPractice: vi.fn(),
  getPracticeChapterById: vi.fn(),
  getPracticeChapterByRoute: vi.fn(),
  loadPracticeSession: vi.fn(),
  savePracticeAnswer: vi.fn(),
  savePracticeFlag: vi.fn(),
  startOrResumePracticeForRoute: vi.fn(),
  startPractice: vi.fn(),
}));

vi.mock("@/src/e2e/guard", () => ({ isE2EEnabled: () => false }));
vi.mock("@/src/features/practice/actions", () => ({
  finishPractice,
  getPracticeChapterById,
  getPracticeChapterByRoute,
  loadPracticeSession,
  loadOrStartPracticeE2E: vi.fn(),
  savePracticeAnswer,
  savePracticeFlag,
  startOrResumePracticeForRoute,
  startPractice,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: vi.fn(),
}));
vi.mock("@/src/features/practice/components/practice-session", () => ({
  PracticeSession: () => <div>Practice session loaded</div>,
}));

import CoursePracticePage from "@/app/(protected)/courses/[courseSlug]/chapters/[position]/practice/page";
import LegacyPracticePage from "@/app/(protected)/practice/[chapterId]/page";

const course = {
  id: "course-1",
  slug: "kinh-te-chinh-tri-mac-lenin",
  status: "published",
};
const chapter = {
  id: "chapter-2",
  course_id: course.id,
  position: 2,
  title: "Chương 2",
  course,
};

afterEach(cleanup);

describe("practice routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPracticeChapterByRoute.mockResolvedValue(chapter);
    getPracticeChapterById.mockResolvedValue(chapter);
    startPractice.mockResolvedValue({ attemptId: "attempt-new" });
    loadPracticeSession.mockResolvedValue({ attemptId: "attempt-existing" });
  });

  it("renders a launch form without mutating during the canonical GET", async () => {
    render(
      await CoursePracticePage({
        params: Promise.resolve({
          courseSlug: course.slug,
          position: String(chapter.position),
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(startPractice).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /bắt đầu luyện tập/i }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /bắt đầu luyện tập/i }),
      ).toBeEnabled(),
    );
  });

  it("renders a launch form without mutating during the legacy GET", async () => {
    render(
      await LegacyPracticePage({
        params: Promise.resolve({ chapterId: chapter.id }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(startPractice).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /bắt đầu luyện tập/i }),
    ).toBeVisible();
  });

  it("reloads the requested attempt without creating or resuming another", async () => {
    render(
      await CoursePracticePage({
        params: Promise.resolve({
          courseSlug: course.slug,
          position: String(chapter.position),
        }),
        searchParams: Promise.resolve({ attempt: "attempt-existing" }),
      }),
    );

    expect(screen.getByText("Practice session loaded")).toBeVisible();
    expect(startPractice).not.toHaveBeenCalled();
    expect(startOrResumePracticeForRoute).not.toHaveBeenCalled();
    expect(loadPracticeSession).toHaveBeenCalledWith(
      chapter.id,
      "attempt-existing",
    );
  });
});
