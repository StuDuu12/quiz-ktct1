// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a data-next-link="true" href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/src/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { updateUser: vi.fn() },
  }),
  getAuthErrorMessage: vi.fn(),
  requestPasswordReset: vi.fn(),
  signIn: vi.fn(),
  signUpStudent: vi.fn(),
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import Home from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

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

  it("accepts a username or email as the login identifier", () => {
    render(<LoginPage />);

    const identifier = screen.getByLabelText("Tên đăng nhập hoặc email");
    expect(identifier).toHaveAttribute("name", "identifier");
    expect(identifier).toHaveAttribute("type", "text");
    expect(identifier).toHaveAttribute("autocomplete", "username");
  });

  it("uses a full document navigation for password recovery", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("link", { name: "Quên mật khẩu?" }),
    ).not.toHaveAttribute("data-next-link");
  });

  it("uses browser submit handlers instead of React form actions", () => {
    for (const Page of [
      LoginPage,
      RegisterPage,
      ForgotPasswordPage,
      ResetPasswordPage,
    ]) {
      const { container } = render(<Page />);
      expect(container.querySelector(".auth-form")).not.toHaveAttribute("action");
      cleanup();
    }
  });

  it("defers password minimum length validation to the hosted auth policy", () => {
    for (const Page of [RegisterPage, ResetPasswordPage]) {
      render(<Page />);

      for (const input of screen.getAllByLabelText(/mật khẩu/i)) {
        expect(input).not.toHaveAttribute("minlength");
      }

      cleanup();
    }
  });
});
