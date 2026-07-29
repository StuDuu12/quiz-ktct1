// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminNavigation } from "@/src/features/admin/components/admin-navigation";
import { ImportWorkspace } from "@/src/features/admin/components/import-workspace";
import { ImportPreviewPanel } from "@/src/features/question-bank/components/import-preview";

afterEach(cleanup);

const validMarkdown = [
  "Câu 1: Nội dung câu hỏi?",
  "",
  "A. Phương án một",
  "",
  "B. Phương án hai",
  "",
  "C. Phương án ba",
  "",
  "D. Phương án bốn",
  "",
  "**Đáp án đúng: B**",
  "",
  "**Giải thích:** Giải thích đầy đủ.",
].join("\n");

const importChoices = {
  courses: [
    { id: "10000000-0000-0000-0000-000000000001", title: "Khóa một" },
    { id: "10000000-0000-0000-0000-000000000002", title: "Khóa hai" },
  ],
  chapters: [
    {
      id: "20000000-0000-0000-0000-000000000001",
      courseId: "10000000-0000-0000-0000-000000000001",
      position: 1,
      title: "Chương một",
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      courseId: "10000000-0000-0000-0000-000000000002",
      position: 1,
      title: "Chương hai",
    },
  ],
};

function prepareImportPreview() {
  fireEvent.change(screen.getByLabelText("Nội dung Markdown"), {
    target: { value: validMarkdown },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Phân tích và xem trước" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /xác nhận ghi 1 câu hợp lệ/i,
    }),
  );
}

describe("administration portal components", () => {
  it("keeps user administration out of the instructor navigation", () => {
    const { rerender } = render(
      <AdminNavigation role="instructor" currentPath="/admin/courses" />,
    );
    expect(screen.queryByRole("link", { name: /người dùng/i })).toBeNull();
    expect(screen.getByRole("link", { name: /khóa học/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /báo cáo/i })).toBeVisible();

    rerender(<AdminNavigation role="admin" currentPath="/admin/users" />);
    expect(screen.getByRole("link", { name: /người dùng/i })).toBeVisible();
  });

  it("shows import counts, issue details, and an explicit final confirmation", () => {
    render(
      <ImportPreviewPanel
        preview={{
          chapterId: "chapter-1",
          parsedCount: 4,
          validCount: 2,
          issueCount: 1,
          duplicateCount: 1,
          duplicateSourceNumbers: [2],
          issues: [
            { line: 18, code: "invalid-options", message: "Thiếu phương án D" },
          ],
          importableQuestions: [],
          confirmationRequired: true,
        }}
      />,
    );

    expect(screen.getByText("2 câu hợp lệ")).toBeVisible();
    expect(screen.getByText("1 lỗi")).toBeVisible();
    expect(screen.getByText("1 câu trùng")).toBeVisible();
    expect(screen.getByText(/thiếu phương án d/i)).toBeVisible();
    expect(
      screen.getByRole("checkbox", {
        name: /xác nhận ghi 2 câu hợp lệ/i,
      }),
    ).toBeRequired();
    expect(
      screen.getByRole("button", { name: /nhập 2 câu/i }),
    ).toBeDisabled();
  });

  it("reuses one preview idempotency key after a lost response and replaces confirmation after success", async () => {
    const commitAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        job_id: "90000000-0000-0000-0000-000000000001",
        imported_count: 1,
      });
    render(
      <ImportWorkspace {...importChoices} commitAction={commitAction} />,
    );
    prepareImportPreview();

    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 câu" }));
    await screen.findByText(
      "Không thể nhập dữ liệu. Không có phần dữ liệu nào được ghi.",
    );
    const firstKey = commitAction.mock.calls[0]![0].idempotencyKey;

    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 câu" }));
    await screen.findByText(/Đã nhập 1 câu/);

    expect(commitAction).toHaveBeenCalledTimes(2);
    expect(commitAction.mock.calls[1]![0].idempotencyKey).toBe(firstKey);
    expect(
      screen.queryByRole("button", { name: "Nhập 1 câu" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Đã nhập 1 câu" }),
    ).toBeDisabled();
  });

  it("regenerates the key only after an import identity input changes", async () => {
    const commitAction = vi.fn().mockRejectedValue(new Error("retryable"));
    render(
      <ImportWorkspace {...importChoices} commitAction={commitAction} />,
    );
    prepareImportPreview();

    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 câu" }));
    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(1));
    const firstKey = commitAction.mock.calls[0]![0].idempotencyKey;

    fireEvent.change(screen.getByLabelText("Tên tệp"), {
      target: { value: "renamed.md" },
    });
    expect(
      screen.queryByRole("button", { name: "Nhập 1 câu" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích và xem trước" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /xác nhận ghi 1 câu hợp lệ/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 câu" }));
    await waitFor(() => expect(commitAction).toHaveBeenCalledTimes(2));

    expect(commitAction.mock.calls[1]![0].idempotencyKey).not.toBe(firstKey);
  });

  it("prevents concurrent confirmation from submitting the same preview twice", async () => {
    let finishCommit:
      | ((value: {
          job_id: string;
          imported_count: number;
        }) => void)
      | undefined;
    const commitAction = vi.fn(
      () =>
        new Promise<{
          job_id: string;
          imported_count: number;
        }>((resolve) => {
          finishCommit = resolve;
        }),
    );
    render(
      <ImportWorkspace {...importChoices} commitAction={commitAction} />,
    );
    prepareImportPreview();
    const confirm = screen.getByRole("button", { name: "Nhập 1 câu" });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(commitAction).toHaveBeenCalledTimes(1);

    finishCommit?.({
      job_id: "90000000-0000-0000-0000-000000000001",
      imported_count: 1,
    });
    await screen.findByText(/Đã nhập 1 câu/);
  });
});
