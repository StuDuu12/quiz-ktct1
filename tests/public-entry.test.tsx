// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/src/lib/supabase/browser", () => ({
  getAuthErrorMessage: vi.fn(),
  signIn: vi.fn(),
}));

import Home from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";

describe("public entry experience", () => {
  it("presents the course, practice path, and primary auth actions", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "Luyện chắc từng chương. Tự tin bước vào phòng thi.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Dữ liệu học phần")).toHaveTextContent(
      "497 câu hỏi đã đối chiếu",
    );
    expect(
      screen.getByRole("link", { name: "Bắt đầu luyện tập" }),
    ).toHaveAttribute("href", "/register");
    expect(screen.getAllByRole("link", { name: "Đăng nhập" })).toHaveLength(2);
    for (const loginLink of screen.getAllByRole("link", { name: "Đăng nhập" })) {
      expect(loginLink).toHaveAttribute("href", "/login");
    }
  });

  it("wraps login in the shared branded auth presentation", () => {
    const { container } = render(<LoginPage />);

    expect(container.querySelector(".auth-shell")).toBeInTheDocument();
    expect(container.querySelector(".auth-brand-panel")).toBeInTheDocument();
    expect(container.querySelector(".auth-card")).toBeInTheDocument();
  });
});
