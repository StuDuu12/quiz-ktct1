import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

import {
  getAuthErrorMessage,
  requestPasswordReset,
  signUpStudent,
} from "@/src/lib/supabase/browser";

describe("browser auth actions", () => {
  const signUp = vi.fn();
  const resetPasswordForEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    createBrowserClient.mockReturnValue({
      auth: { signUp, resetPasswordForEmail },
    });
  });

  it("registers public accounts with the student role only", async () => {
    signUp.mockResolvedValue({ data: { user: null }, error: null });

    await signUpStudent({
      fullName: "Nguyen Van A",
      email: "student@example.com",
      password: "password-123",
      origin: "https://quiz.example.com",
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "password-123",
      options: {
        emailRedirectTo: "https://quiz.example.com/auth/callback",
        data: { full_name: "Nguyen Van A", requested_role: "student" },
      },
    });
  });

  it("sends password recovery through the session callback", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await requestPasswordReset(
      "student@example.com",
      "https://quiz.example.com",
    );

    expect(resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://quiz.example.com/auth/callback?next=/reset-password",
    });
  });

  it("makes invalid credentials and rate limits explicit", () => {
    expect(
      getAuthErrorMessage({ message: "Invalid login credentials" }, "signin"),
    ).toBe("Email hoặc mật khẩu không đúng.");
    expect(
      getAuthErrorMessage({ message: "For security purposes, you can only request this after 60 seconds." }, "signin"),
    ).toBe("Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.");
    expect(
      getAuthErrorMessage({ message: "Email not confirmed" }, "signin"),
    ).toBe("Bạn cần xác minh email trước khi đăng nhập.");
  });

  it("makes an expired recovery link explicit", () => {
    expect(
      getAuthErrorMessage({ message: "Token has expired or is invalid" }, "reset"),
    ).toBe("Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu một liên kết mới.");
  });
});
