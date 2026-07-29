import { createBrowserClient } from "@supabase/ssr";

import { isE2EBrowserMode } from "@/src/e2e/browser";
import type { PortalDestination } from "@/src/features/auth/destination";
import type { AppRole } from "@/src/features/auth/roles";
import type { Database } from "@/src/lib/supabase/database.types";
import { getPublicEnv } from "@/src/lib/env";

export function createBrowserSupabaseClient() {
  const { supabaseAnonKey, supabaseUrl } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

export type SignUpStudentInput = {
  fullName: string;
  email: string;
  password: string;
  origin: string;
};

type AuthError = { message?: string } | null | undefined;

export function getAuthErrorMessage(
  error: AuthError,
  context: "signin" | "register" | "reset",
) {
  const message = error?.message?.toLowerCase() ?? "";

  if (message.includes("rate") || message.includes("security purposes")) {
    return "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.";
  }
  if (context === "signin" && message.includes("invalid login")) {
    return "Email hoặc mật khẩu không đúng.";
  }
  if (context === "signin" && message.includes("email not confirmed")) {
    return "Bạn cần xác minh email trước khi đăng nhập.";
  }
  if (
    context === "reset" &&
    (message.includes("expired") || message.includes("invalid"))
  ) {
    return "Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu một liên kết mới.";
  }

  return error?.message || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

export async function signUpStudent({
  fullName,
  email,
  password,
  origin,
}: SignUpStudentInput) {
  if (isE2EBrowserMode()) {
    const response = await fetch("/api/e2e/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName, email, password }),
    });
    const result = (await response.json()) as { error: string | null };
    return {
      data: null,
      error: result.error ? { message: result.error } : null,
    };
  }
  return createBrowserSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: fullName, requested_role: "student" },
    },
  });
}

type SignInResult = {
  data: { role: AppRole; destination: PortalDestination } | null;
  error: { message: string } | null;
};

type SignInResponse = {
  error: string | null;
  role?: AppRole;
  destination?: PortalDestination;
};

function parseSignInResponse(result: SignInResponse): SignInResult {
  if (result.error) {
    return { data: null, error: { message: result.error } };
  }
  if (!result.role || !result.destination) {
    return {
      data: null,
      error: { message: "Không xác định được không gian làm việc." },
    };
  }
  return {
    data: { role: result.role, destination: result.destination },
    error: null,
  };
}

export async function signIn(
  identifier: string,
  password: string,
): Promise<SignInResult> {
  if (isE2EBrowserMode()) {
    const response = await fetch("/api/e2e/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: identifier, password }),
    });
    return parseSignInResponse((await response.json()) as SignInResponse);
  }
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  return parseSignInResponse((await response.json()) as SignInResponse);
}

export async function signOut() {
  return createBrowserSupabaseClient().auth.signOut();
}

export async function requestPasswordReset(email: string, origin: string) {
  return createBrowserSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
}
