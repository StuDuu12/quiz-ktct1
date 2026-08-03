// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExamLaunchForm } from "@/src/features/exam/components/exam-launch-form";
import type { StartMockExamResult } from "@/src/features/exam/actions";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ExamLaunchForm", () => {
  it("shows pending immediately, blocks duplicate submits, and navigates on success", async () => {
    const pending = deferred<StartMockExamResult>();
    const action = vi.fn(() => pending.promise);
    render(<ExamLaunchForm action={action} />);

    const form = screen.getByRole("button", { name: "Bắt đầu thi thử" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(
      screen.getByRole("button", { name: "Đang tạo đề…" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đang tạo đề thi, vui lòng chờ.",
    );
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ok: true, url: "/exam/attempt-1" });
      await pending.promise;
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/exam/attempt-1"));
  });

  it("keeps the launch page usable with a retry after an expected failure", async () => {
    const action = vi
      .fn<() => Promise<StartMockExamResult>>()
      .mockResolvedValueOnce({
        ok: false,
        message: "Không thể tạo đề thi lúc này. Vui lòng thử lại.",
      })
      .mockResolvedValueOnce({ ok: true, url: "/exam/attempt-2" });
    render(<ExamLaunchForm action={action} />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Bắt đầu thi thử" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tạo đề thi lúc này. Vui lòng thử lại.",
    );
    const retry = screen.getByRole("button", { name: "Thử tạo đề lại" });
    expect(retry).toBeEnabled();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/exam/attempt-2"));
  });

  it("contains an unexpected client rejection with the same safe message", async () => {
    const action = vi.fn<() => Promise<StartMockExamResult>>().mockRejectedValue(
      new Error("private transport detail"),
    );
    render(<ExamLaunchForm action={action} />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Bắt đầu thi thử" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tạo đề thi lúc này. Vui lòng thử lại.",
    );
    expect(screen.queryByText(/private transport detail/i)).not.toBeInTheDocument();
  });
});
