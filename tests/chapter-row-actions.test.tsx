// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChapterRow } from "@/src/features/catalog/components/chapter-row";
import type { ChapterSummary } from "@/src/features/catalog/queries";

const chapter: ChapterSummary = {
  id: "chapter-1",
  position: 1,
  title: "Đối tượng và phương pháp nghiên cứu",
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

describe("ChapterRow attempt actions", () => {
  it("keeps score as data and exposes explicit review and resume links", () => {
    const { container } = render(
      <ChapterRow chapter={chapter} courseSlug="ktct" />,
    );
    const accordion = container.querySelector("details");
    expect(accordion).not.toBeNull();
    accordion!.open = true;

    expect(screen.queryByRole("link", { name: "95%" })).toBeNull();
    expect(screen.getByRole("link", { name: "Xem lại" })).toHaveAttribute(
      "href",
      "/results/submitted-1",
    );
    expect(screen.getByRole("link", { name: "Tiếp tục" })).toHaveAttribute(
      "href",
      "/courses/ktct/chapters/1/practice?attempt=active-1",
    );
  });
});
