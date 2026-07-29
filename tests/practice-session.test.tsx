// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeSession } from "@/src/features/practice/components/practice-session";
import type { PracticeState } from "@/src/features/practice/types";

afterEach(cleanup);

const initialState: PracticeState = {
  attemptId: "attempt-1",
  courseSlug: "ktct",
  chapterId: "chapter-1",
  chapterPosition: 1,
  chapterTitle: "Hàng hóa và tiền tệ",
  currentQuestionId: "q1",
  status: "in_progress",
  questions: [
    {
      id: "q1",
      attemptQuestionId: "aq1",
      content: "Câu hỏi 1?",
      explanation: "",
      options: [
        { id: "a1", label: "A", content: "Đáp án A" },
        { id: "b1", label: "B", content: "Đáp án B" },
        { id: "c1", label: "C", content: "Đáp án C" },
        { id: "d1", label: "D", content: "Đáp án D" },
      ],
    },
    {
      id: "q2",
      attemptQuestionId: "aq2",
      content: "Câu hỏi 2?",
      explanation: "",
      options: [
        { id: "a2", label: "A", content: "Đáp án A2" },
        { id: "b2", label: "B", content: "Đáp án B2" },
        { id: "c2", label: "C", content: "Đáp án C2" },
        { id: "d2", label: "D", content: "Đáp án D2" },
      ],
    },
  ],
  answers: {},
};

describe("PracticeSession", () => {
  it("submits keyboard answers once and shows immediate feedback", async () => {
    const saveAnswer = vi.fn().mockResolvedValue({
      isCorrect: false,
      explanation: "Đáp án A mới đúng.",
    });

    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={saveAnswer}
        saveFlag={vi.fn().mockResolvedValue(undefined)}
        finish={vi.fn().mockResolvedValue({ score: 0 })}
      />,
    );

    fireEvent.keyDown(window, { key: "2" });

    await waitFor(() =>
      expect(screen.getByText("Chưa chính xác")).toBeInTheDocument(),
    );
    expect(screen.getByText("Đáp án A mới đúng.")).toBeInTheDocument();
    expect(saveAnswer).toHaveBeenCalledOnce();
    expect(screen.getByRole("radio", { name: /Đáp án C/ })).toBeDisabled();

    fireEvent.keyDown(window, { key: "3" });
    expect(saveAnswer).toHaveBeenCalledOnce();
  });

  it("shows every question in the navigator and persists F-key flags", async () => {
    const saveFlag = vi.fn().mockResolvedValue(undefined);

    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={vi.fn()}
        saveFlag={saveFlag}
        finish={vi.fn().mockResolvedValue({ score: 0 })}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Danh sách câu hỏi" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Câu 1/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: /Câu 2/ })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f" });
    await waitFor(() => expect(saveFlag).toHaveBeenCalledWith("attempt-1", "aq1", true));
    expect(screen.getByRole("button", { name: /Câu 1.*đặt cờ/i })).toBeInTheDocument();
  });

  it("requires review confirmation before finishing", async () => {
    const finish = vi.fn().mockResolvedValue({ score: 0 });

    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={vi.fn()}
        saveFlag={vi.fn().mockResolvedValue(undefined)}
        finish={finish}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kết thúc" }));
    expect(screen.getByRole("dialog", { name: "Rà soát lượt luyện tập" })).toBeInTheDocument();
    expect(screen.getByText("2 câu chưa trả lời")).toBeInTheDocument();
    expect(finish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hoàn thành" }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith("attempt-1"));
  });

  it("shows the persisted score when a submitted practice page is reloaded", () => {
    render(
      <PracticeSession
        initialState={{ ...initialState, status: "submitted", score: 75 }}
        saveAnswer={vi.fn()}
        saveFlag={vi.fn()}
        finish={vi.fn()}
      />,
    );

    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
