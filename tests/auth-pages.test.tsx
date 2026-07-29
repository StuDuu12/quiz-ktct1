// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, replace, signIn } = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
}));

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

vi.mock("@/src/lib/supabase/browser", () => ({
  getAuthErrorMessage: vi.fn(),
  signIn,
}));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the server-authoritative portal destination after signing in", async () => {
    signIn.mockResolvedValue({
      data: { role: "admin", destination: "/admin" },
      error: null,
    });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Tên đăng nhập hoặc email"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the submit button disabled until the sign-in request settles", async () => {
    let resolveSignIn: ((value: unknown) => void) | undefined;
    signIn.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();

    resolveSignIn?.({
      data: { role: "student", destination: "/dashboard" },
      error: null,
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});
