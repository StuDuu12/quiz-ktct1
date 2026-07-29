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
  LoadExamReview,
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
    loadReview?: ReturnType<typeof vi.fn<LoadExamReview>>;
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
  const loadReview =
    actions.loadReview ??
    vi.fn<LoadExamReview>().mockResolvedValue({
      revision: 1,
      answers: Object.fromEntries(
        initialState.questions.map((question) => [
          question.attemptQuestionId,
          initialState.answers[question.id] ?? { flagged: false },
        ]),
      ),
    });
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
      loadReview={loadReview}
      submit={submit}
    />,
  );
  return { saveAnswer, saveFlag, loadReview, submit };
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

  it("serializes rapid same-tab answers even when the first network response is delayed", async () => {
    let resolveFirst:
      | ((value: { optionId: string; flagged: boolean }) => void)
      | undefined;
    let resolveSecond:
      | ((value: { optionId: string; flagged: boolean }) => void)
      | undefined;
    const first = new Promise<{ optionId: string; flagged: boolean }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const second = new Promise<{ optionId: string; flagged: boolean }>(
      (resolve) => {
        resolveSecond = resolve;
      },
    );
    const saveAnswer = vi
      .fn<SaveExamAnswer>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    renderSession(buildState(), { saveAnswer });

    fireEvent.click(
      screen.getByRole("radio", { name: /Phương án B của câu 1/ }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Phương án C của câu 1/ }),
    );

    await waitFor(() => expect(saveAnswer).toHaveBeenCalledTimes(1));
    expect(saveAnswer).toHaveBeenNthCalledWith(
      1,
      "attempt-1",
      "aq1",
      "q1-b",
    );
    expect(saveAnswer).not.toHaveBeenCalledWith(
      "attempt-1",
      "aq1",
      "q1-c",
    );
    await act(async () => {
      resolveFirst?.({ optionId: "q1-b", flagged: false });
      await first;
    });
    await waitFor(() => expect(saveAnswer).toHaveBeenCalledTimes(2));
    expect(saveAnswer).toHaveBeenNthCalledWith(
      2,
      "attempt-1",
      "aq1",
      "q1-c",
    );
    await act(async () => {
      resolveSecond?.({ optionId: "q1-c", flagged: false });
      await second;
    });
    expect(
      screen.getByRole("radio", { name: /Phương án C của câu 1/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("serializes answer and flag mutations through the same queue", async () => {
    let resolveAnswer:
      | ((value: { optionId: string; flagged: boolean }) => void)
      | undefined;
    const pendingAnswer = new Promise<{
      optionId: string;
      flagged: boolean;
    }>((resolve) => {
      resolveAnswer = resolve;
    });
    const saveAnswer = vi.fn<SaveExamAnswer>().mockReturnValue(pendingAnswer);
    const saveFlag = vi.fn<ToggleExamFlag>().mockResolvedValue(undefined);
    renderSession(buildState(), { saveAnswer, saveFlag });

    fireEvent.click(
      screen.getByRole("radio", { name: /Phương án B của câu 1/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Đặt cờ/ }));

    await waitFor(() => expect(saveAnswer).toHaveBeenCalledTimes(1));
    expect(saveFlag).not.toHaveBeenCalled();

    await act(async () => {
      resolveAnswer?.({ optionId: "q1-b", flagged: false });
      await pendingAnswer;
    });
    await waitFor(() =>
      expect(saveFlag).toHaveBeenCalledWith("attempt-1", "aq1", true),
    );
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

    const dialog = await screen.findByRole("dialog", {
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

    const dialog = await screen.findByRole("dialog", {
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
    const reopenedDialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(reopenedDialog).getByRole("button", {
        name: "Xác nhận nộp bài",
      }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith("attempt-1", 1),
    );
    expect(
      await screen.findByRole("heading", { name: "Bài thi đã được nộp" }),
    ).toBeInTheDocument();
  });

  it("reloads authoritative review and requires reconfirmation after another tab writes", async () => {
    const firstAnswers = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `aq${index + 1}`,
        index === 0
          ? { optionId: "q1-a", flagged: false }
          : { flagged: false },
      ]),
    );
    const changedAnswers = {
      ...firstAnswers,
      aq1: { optionId: "q1-b", flagged: true },
    };
    const loadReview = vi
      .fn<LoadExamReview>()
      .mockResolvedValueOnce({ revision: 4, answers: firstAnswers })
      .mockResolvedValueOnce({ revision: 5, answers: changedAnswers });
    const submit = vi
      .fn<SubmitExam>()
      .mockRejectedValueOnce(new Error("REVIEW_STALE"))
      .mockResolvedValueOnce({
        attemptId: "attempt-1",
        status: "submitted",
        score: 50,
        submittedAt: "2026-07-29T10:31:00.000Z",
        durationSeconds: 1860,
      });
    renderSession(buildState(), { loadReview, submit });

    fireEvent.click(screen.getByRole("button", { name: "Rà soát và nộp bài" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Rà soát trước khi nộp bài",
    });
    expect(within(dialog).getByText("A. Phương án A của câu 1")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận nộp bài" }),
    );
    expect(
      await within(dialog).findByRole("alert"),
    ).toHaveTextContent("đã thay đổi ở một tab khác");
    expect(within(dialog).getByText("B. Phương án B của câu 1")).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenNthCalledWith(1, "attempt-1", 4);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận nộp bài" }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenNthCalledWith(2, "attempt-1", 5),
    );
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

  it("recomputes from the absolute deadline after a background clock jump", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:59:50.000Z"));
    const submit = vi.fn<SubmitExam>().mockResolvedValue({
      attemptId: "attempt-1",
      status: "submitted",
      score: 0,
      submittedAt: "2026-07-29T11:00:00.000Z",
      durationSeconds: 3600,
    });
    renderSession(
      buildState({ serverNow: "2026-07-29T10:59:50.000Z" }),
      { submit },
    );
    expect(screen.getByText("00:10")).toBeInTheDocument();

    vi.setSystemTime(new Date("2026-07-29T11:00:02.000Z"));
    await act(async () => {
      fireEvent.focus(window);
      await Promise.resolve();
    });

    expect(submit).toHaveBeenCalledWith("attempt-1");
  });

  it("makes the mobile navigator modal with focus trap, Escape, inert background, and restore", async () => {
    renderSession();
    const trigger = screen.getByRole("button", { name: /Danh sách câu/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Danh sách câu hỏi trên thiết bị di động",
    });
    const close = within(dialog).getByRole("button", {
      name: "Đóng danh sách câu hỏi",
    });
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    expect(close).toHaveFocus();
    const questionButtons = within(dialog).getAllByRole("button", {
      name: /Câu \d+/,
    });
    questionButtons.at(-1)!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", {
        name: "Danh sách câu hỏi trên thiết bị di động",
      }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
    expect(
      screen.getByRole("link", { name: /xem chi tiết kết quả/i }),
    ).toHaveAttribute("href", "/results/attempt-1");
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
