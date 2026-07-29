// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExamSession } from "@/src/features/exam/components/exam-session";
import type {
  ExamSessionState,
  SaveExamAnswer,
  SubmitExam,
  ToggleExamFlag,
} from "@/src/features/exam/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function buildState(
  overrides: Partial<ExamSessionState> = {},
): ExamSessionState {
  const questions = Array.from({ length: 40 }, (_, index) => {
    const number = index + 1;
    return {
      id: `q${number}`,
      attemptQuestionId: `aq${number}`,
      content: `Nội dung câu hỏi ${number}?`,
      difficulty: 2,
      options: ["A", "B", "C", "D"].map((label, optionIndex) => ({
        id: `q${number}-${label.toLowerCase()}`,
        label,
        content: `Phương án ${label} của câu ${number}`,
        optionIndex,
      })),
    };
  });
  return {
    attemptId: "attempt-1",
    courseId: "course-1",
    courseSlug: "kinh-te-chinh-tri-mac-lenin",
    courseTitle: "Kinh tế chính trị Mác – Lênin",
    status: "in_progress",
    startedAt: "2026-07-29T10:00:00.000Z",
    expiresAt: "2026-07-29T11:00:00.000Z",
    serverNow: "2026-07-29T10:30:00.000Z",
    submittedAt: null,
    score: null,
    durationSeconds: null,
    currentQuestionId: "q1",
    questions,
    answers: {},
    ...overrides,
  };
}

function renderSession(
  initialState = buildState(),
  actions: {
    saveAnswer?: ReturnType<typeof vi.fn<SaveExamAnswer>>;
    saveFlag?: ReturnType<typeof vi.fn<ToggleExamFlag>>;
    submit?: ReturnType<typeof vi.fn<SubmitExam>>;
  } = {},
) {
  const saveAnswer =
    actions.saveAnswer ??
    vi.fn<SaveExamAnswer>(
      async (
        _attemptId: string,
        _attemptQuestionId: string,
        optionId: string,
      ) => ({ optionId, flagged: false }),
    );
  const saveFlag =
    actions.saveFlag ??
    vi.fn<ToggleExamFlag>().mockResolvedValue(undefined);
  const submit =
    actions.submit ??
    vi.fn<SubmitExam>().mockResolvedValue({
      attemptId: "attempt-1",
      status: "submitted",
      score: 75,
      submittedAt: "2026-07-29T10:30:00.000Z",
      durationSeconds: 1800,
    });
  render(
    <ExamSession
      initialState={initialState}
      saveAnswer={saveAnswer}
      saveFlag={saveFlag}
      submit={submit}
    />,
  );
  return { saveAnswer, saveFlag, submit };
}

describe("ExamSession", () => {
  it("shows one question while the desktop navigator exposes all 40 without correctness", () => {
    renderSession();

    expect(
      screen.getByRole("heading", { name: "Nội dung câu hỏi 1?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nội dung câu hỏi 2?")).not.toBeInTheDocument();
    const navigator = screen.getByRole("navigation", {
      name: "Danh sách 40 câu hỏi",
    });
    expect(within(navigator).getAllByRole("button")).toHaveLength(40);
    expect(
      within(navigator).getByRole("button", {
        name: "Câu 1, hiện tại, chưa trả lời, không đặt cờ",
      }),
    ).toHaveAttribute("aria-current", "step");
    expect(navigator).not.toHaveTextContent(/đúng|sai/i);
  });

  it("uses 1–4, F, previous, and next controls and persists their changes", async () => {
    const { saveAnswer, saveFlag } = renderSession();

    fireEvent.keyDown(window, { key: "2" });
    await waitFor(() =>
      expect(saveAnswer).toHaveBeenCalledWith("attempt-1", "aq1", "q1-b"),
    );
    expect(
      screen.getByRole("radio", { name: /Phương án B của câu 1/ }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(window, { key: "f" });
    await waitFor(() =>
      expect(saveFlag).toHaveBeenCalledWith("attempt-1", "aq1", true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Câu tiếp" }));
    expect(
      screen.getByRole("heading", { name: "Nội dung câu hỏi 2?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Câu trước" }));
    expect(
      screen.getByRole("heading", { name: "Nội dung câu hỏi 1?" }),
    ).toBeInTheDocument();
  });

  it("reconciles an optimistic choice to the authoritative option returned by the server", async () => {
    const saveAnswer = vi.fn().mockResolvedValue({
      optionId: "q1-a",
      flagged: false,
    });
    renderSession(buildState(), { saveAnswer });

    fireEvent.click(
      screen.getByRole("radio", { name: /Phương án B của câu 1/ }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: /Phương án A của câu 1/ }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(
      screen.getByRole("radio", { name: /Phương án B của câu 1/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("keeps an unsaved answer visible with an explicit retry after a network error", async () => {
    const saveAnswer = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ optionId: "q1-c", flagged: false });
    renderSession(buildState(), { saveAnswer });

    fireEvent.click(
      screen.getByRole("radio", { name: /Phương án C của câu 1/ }),
    );
    expect(
      await screen.findByRole("alert", { name: "Lỗi lưu bài thi" }),
    ).toHaveTextContent("chưa được lưu");
    expect(
      screen.getByRole("radio", { name: /Phương án C của câu 1/ }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));
    await waitFor(() => expect(saveAnswer).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reviews all 40 selected answers, not only counts, before explicit confirmation", async () => {
    const answers = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `q${index + 1}`,
        {
          optionId: `q${index + 1}-${index % 2 === 0 ? "a" : "b"}`,
          flagged: index < 3,
        },
      ]),
    );
    const { submit } = renderSession(buildState({ answers }));

    const trigger = screen.getByRole("button", { name: "Rà soát và nộp bài" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Rà soát trước khi nộp bài",
    });
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    expect(within(dialog).getByText("40 câu đã trả lời")).toBeInTheDocument();
    expect(within(dialog).getByText("0 câu chưa trả lời")).toBeInTheDocument();
    expect(within(dialog).getByText("3 câu đặt cờ")).toBeInTheDocument();
    expect(
      within(dialog).getByText("A. Phương án A của câu 1"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("B. Phương án B của câu 40"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByRole("button", { name: /Xem câu/ }),
    ).toHaveLength(40);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Quay lại làm bài" }),
    );
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it("traps focus, closes review on Escape, and submits only on final confirmation", async () => {
    const { submit } = renderSession();
    const trigger = screen.getByRole("button", { name: "Rà soát và nộp bài" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Rà soát trước khi nộp bài",
    });
    const close = within(dialog).getByRole("button", {
      name: "Đóng rà soát",
    });
    expect(close).toHaveFocus();
    const confirm = within(dialog).getByRole("button", {
      name: "Xác nhận nộp bài",
    });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận nộp bài" }),
    );
    await waitFor(() => expect(submit).toHaveBeenCalledWith("attempt-1"));
    expect(
      await screen.findByRole("heading", { name: "Bài thi đã được nộp" }),
    ).toBeInTheDocument();
  });

  it("counts down from server-derived time and auto-submits through the same action at zero", async () => {
    vi.useFakeTimers();
    const submit = vi.fn().mockResolvedValue({
      attemptId: "attempt-1",
      status: "submitted",
      score: 0,
      submittedAt: "2026-07-29T11:00:00.000Z",
      durationSeconds: 3600,
    });
    renderSession(
      buildState({
        serverNow: "2026-07-29T10:59:58.000Z",
      }),
      { submit },
    );

    expect(screen.getByText("00:02")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("attempt-1");
  });

  it("renders a reload of an already submitted attempt without permitting edits", () => {
    renderSession(
      buildState({
        status: "submitted",
        score: 87.5,
        submittedAt: "2026-07-29T10:45:00.000Z",
        durationSeconds: 2700,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Bài thi đã được nộp" }),
    ).toBeInTheDocument();
    expect(screen.getByText("87,5%")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("ignores answer and flag shortcuts from editable targets", () => {
    const saveAnswer = vi.fn();
    const saveFlag = vi.fn();
    renderSession(buildState(), { saveAnswer, saveFlag });
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
