// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "@/src/features/history/components/history-list";
import { ResultReview } from "@/src/features/history/components/result-review";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const submittedAttempt = {
  id: "attempt-1",
  userId: "student-1",
  courseId: "course-1",
  courseSlug: "kinh-te-chinh-tri-mac-lenin",
  courseTitle: "Kinh tế chính trị",
  kind: "practice" as const,
  status: "submitted" as const,
  startedAt: "2026-07-28T08:00:00.000Z",
  submittedAt: "2026-07-28T08:20:00.000Z",
  score: 50,
  durationSeconds: 1200,
  chapterId: "chapter-1",
  chapterPosition: 1,
  chapterTitle: "Chương 1",
  questionCount: 2,
  totalCount: 2,
};

describe("HistoryList", () => {
  it("links submitted attempts to immutable results and labels active attempts", () => {
    render(
      <HistoryList
        attempts={[
          submittedAttempt,
          {
            ...submittedAttempt,
            id: "attempt-2",
            kind: "mock_exam",
            status: "in_progress",
            score: null,
            submittedAt: null,
          },
        ]}
        page={1}
        pageSize={10}
        filters={{}}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Xem lại" }),
    ).toHaveAttribute("href", "/results/attempt-1");
    expect(screen.getByText("Đang làm")).toBeInTheDocument();
    expect(screen.getByText("Chưa có điểm")).toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    render(
      <HistoryList
        attempts={[]}
        page={1}
        pageSize={10}
        filters={{}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /chưa có lượt làm phù hợp/i }),
    ).toBeInTheDocument();
  });
});

describe("ResultReview", () => {
  it("shows answer, immutable key, explanation, flag, and non-color status text", () => {
    render(
      <ResultReview
        result={{
          attemptId: "attempt-1",
          kind: "practice",
          score: 50,
          startedAt: "2026-07-28T08:00:00.000Z",
          submittedAt: "2026-07-28T08:20:00.000Z",
          durationSeconds: 1200,
          questions: [
            {
              attemptQuestionId: "aq-1",
              position: 1,
              content: "Giá trị hàng hóa do yếu tố nào quyết định?",
              options: [
                { id: "a", label: "A", content: "Lao động cụ thể" },
                {
                  id: "b",
                  label: "B",
                  content: "Lao động xã hội cần thiết",
                },
              ],
              selectedOptionId: "a",
              correctOptionId: "b",
              isCorrect: false,
              isFlagged: true,
              isUnanswered: false,
              explanation: "Đáp án đúng dựa trên thời gian lao động xã hội.",
            },
            {
              attemptQuestionId: "aq-2",
              position: 2,
              content: "Câu chưa trả lời",
              options: [
                { id: "c", label: "A", content: "Phương án A" },
                { id: "d", label: "B", content: "Phương án B" },
              ],
              selectedOptionId: null,
              correctOptionId: "d",
              isCorrect: false,
              isFlagged: false,
              isUnanswered: true,
              explanation: "Giải thích bất biến.",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("Trả lời sai")).toHaveLength(2);
    expect(screen.getAllByText("Chưa trả lời")).toHaveLength(2);
    expect(screen.getByText("Đã đặt cờ")).toBeInTheDocument();
    expect(screen.getByText(/Bạn chọn: A\./)).toBeInTheDocument();
    expect(screen.getAllByText(/Đáp án đúng: B\./)).toHaveLength(2);
    expect(
      screen.getByText(
        "Đáp án đúng dựa trên thời gian lao động xã hội.",
      ),
    ).toBeInTheDocument();
  });

  it("moves through reviewed questions with buttons and arrow keys", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <>
        <ResultReview
          result={{
            attemptId: "attempt-navigation",
            kind: "mock_exam",
            score: 66.67,
            startedAt: "2026-08-03T08:00:00.000Z",
            submittedAt: "2026-08-03T08:30:00.000Z",
            durationSeconds: 1800,
            questions: Array.from({ length: 3 }, (_, index) => ({
              attemptQuestionId: `aq-${index + 1}`,
              position: index + 1,
              content: `Nội dung câu ${index + 1}`,
              options: [
                { id: `q${index + 1}-a`, label: "A", content: "Phương án A" },
                { id: `q${index + 1}-b`, label: "B", content: "Phương án B" },
              ],
              selectedOptionId: `q${index + 1}-a`,
              correctOptionId: `q${index + 1}-a`,
              isCorrect: true,
              isFlagged: false,
              isUnanswered: false,
              explanation: `Giải thích câu ${index + 1}`,
            })),
          }}
        />
        <input aria-label="Ghi chú thử" />
      </>,
    );

    const previous = screen.getByRole("button", { name: "Câu trước" });
    const next = screen.getByRole("button", { name: "Câu tiếp" });
    expect(screen.getByText("Câu 1 / 3")).toBeInTheDocument();
    expect(previous).toBeDisabled();

    fireEvent.click(next);
    await waitFor(() => expect(screen.getByText("Câu 2 / 3")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-result-question", "2"),
    );
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText("Câu 1 / 3")).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByText("Câu 3 / 3")).toBeInTheDocument());
    expect(next).toBeDisabled();

    const editor = screen.getByRole("textbox", { name: "Ghi chú thử" });
    editor.focus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Câu 3 / 3")).toBeInTheDocument();
  });
});
