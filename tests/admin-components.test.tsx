// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminNavigation } from "@/src/features/admin/components/admin-navigation";
import { ImportPreviewPanel } from "@/src/features/question-bank/components/import-preview";

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
});
