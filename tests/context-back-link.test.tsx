// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ContextBackLink } from "@/src/components/context-back-link";
import { AdminShell } from "@/src/features/admin/components/admin-shell";
import { InstructorShell } from "@/src/features/instructor/components/instructor-shell";

afterEach(cleanup);

describe("contextual back navigation", () => {
  it("renders a visible deterministic parent link", () => {
    render(<ContextBackLink href="/history" label="Về lịch sử" />);

    expect(screen.getByRole("link", { name: "Về lịch sử" })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  it("shows a parent link only on admin child pages", () => {
    pathname = "/admin/questions";
    const { rerender } = render(
      <AdminShell email="admin@example.test">
        <p>Nội dung</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("link", { name: "Về trang quản trị" }),
    ).toHaveAttribute("href", "/admin");

    pathname = "/admin";
    rerender(
      <AdminShell email="admin@example.test">
        <p>Nội dung</p>
      </AdminShell>,
    );

    expect(
      screen.queryByRole("link", { name: "Về trang quản trị" }),
    ).toBeNull();
  });

  it("shows a parent link only on instructor child pages", () => {
    pathname = "/instructor/reports";
    render(
      <InstructorShell email="teacher@example.test">
        <p>Nội dung</p>
      </InstructorShell>,
    );

    expect(
      screen.getByRole("link", { name: "Về trang giảng viên" }),
    ).toHaveAttribute("href", "/instructor");
  });
});
