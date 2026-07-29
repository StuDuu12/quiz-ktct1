// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HistoryList } from "@/src/features/history/components/history-list";
import { ResultReview } from "@/src/features/history/components/result-review";

const submittedAttempt = {
  id: "attempt-1",
  userId: "student-1",
  courseId: "course-1",
  courseTitle: "Kinh tế chính trị",
  kind: "practice" as const,
  status: "submitted" as const,
  startedAt: "2026-07-28T08:00:00.000Z",
  submittedAt: "2026-07-28T08:20:00.000Z",
  score: 50,
  durationSeconds: 1200,
  chapterId: "chapter-1",
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
      screen.getByRole("link", { name: /xem kết quả/i }),
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
});
