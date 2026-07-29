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
      optionId: "b1",
      isCorrect: false,
      explanation: "Đáp án A mới đúng.",
      reconciled: false,
    });

    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={saveAnswer}
        saveFlag={vi.fn().mockResolvedValue(undefined)}
        finish={vi.fn().mockResolvedValue({ status: "submitted", score: 0 })}
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
        finish={vi.fn().mockResolvedValue({ status: "submitted", score: 0 })}
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
    const finish = vi.fn().mockResolvedValue({ status: "submitted", score: 0 });

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
    expect(
      screen.getByRole("link", { name: /xem chi tiết kết quả/i }),
    ).toHaveAttribute("href", "/results/attempt-1");
  });

  it("reconciles a losing tab to the option already saved by another tab", async () => {
    const saveAnswer = vi.fn().mockResolvedValue({
      optionId: "a1",
      isCorrect: true,
      explanation: "Đáp án A đúng.",
      reconciled: true,
    });
    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={saveAnswer}
        saveFlag={vi.fn()}
        finish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Đáp án B/ }));

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Đáp án A/ })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(screen.getByRole("radio", { name: /Đáp án B/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText("Đáp án A đúng.")).toBeInTheDocument();
  });

  it("renders an expired reload with a clear start-new path", () => {
    render(
      <PracticeSession
        initialState={{ ...initialState, status: "expired" }}
        saveAnswer={vi.fn()}
        saveFlag={vi.fn()}
        finish={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Lượt luyện tập đã hết hạn" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bắt đầu lượt mới/ })).toHaveAttribute(
      "href",
      "/courses/ktct/chapters/1/practice",
    );
  });

  it("renders expiry when the server expires the attempt during finish", async () => {
    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={vi.fn()}
        saveFlag={vi.fn()}
        finish={vi.fn().mockResolvedValue({ status: "expired", score: null })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kết thúc" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hoàn thành" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Lượt luyện tập đã hết hạn" }),
      ).toBeInTheDocument(),
    );
  });

  it("moves focus into the modal, traps it, closes on Escape, and restores focus", () => {
    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={vi.fn()}
        saveFlag={vi.fn()}
        finish={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Kết thúc" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Rà soát lượt luyện tập",
    });
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Đóng rà soát" })).toHaveFocus();

    const confirm = screen.getByRole("button", { name: "Xác nhận hoàn thành" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Đóng rà soát" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Rà soát lượt luyện tập" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ignores answer and flag shortcuts from editable targets", () => {
    const saveAnswer = vi.fn();
    const saveFlag = vi.fn();
    render(
      <PracticeSession
        initialState={initialState}
        saveAnswer={saveAnswer}
        saveFlag={saveFlag}
        finish={vi.fn()}
      />,
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.appendChild(editor);

    fireEvent.keyDown(input, { key: "2" });
    fireEvent.keyDown(editor, { key: "f" });

    expect(saveAnswer).not.toHaveBeenCalled();
    expect(saveFlag).not.toHaveBeenCalled();
    input.remove();
    editor.remove();
  });
});
