"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useSyncExternalStore, useState } from "react";

import { AuthShell } from "@/src/components/auth/auth-shell";
import { isE2EBrowserMode } from "@/src/e2e/browser";
import { getAuthErrorMessage, signIn } from "@/src/lib/supabase/browser";

const subscribeToHydration = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage(null);
    const { data, error } = await signIn(
      String(formData.get("identifier") ?? ""),
      String(formData.get("password") ?? ""),
    );
    setIsSubmitting(false);

    if (error) {
      setMessage(getAuthErrorMessage(error, "signin"));
      return;
    }
    if (!data) {
      setMessage("Không xác định được không gian làm việc.");
      return;
    }
    if (isE2EBrowserMode()) {
      window.location.assign(data.destination);
      return;
    }
    router.replace(data.destination);
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Chào mừng trở lại"
      title="Đăng nhập"
      description="Tiếp tục lộ trình học và xem lại những lần làm bài trước."
      footer={
        <p>Chưa có tài khoản? <Link href="/register">Đăng ký học viên</Link></p>
      }
    >
      <form
        onSubmit={onSubmit}
        className="auth-form"
        method="post"
        data-hydrated={hydrated ? "true" : "false"}
        noValidate
      >
        <label>
          <span>Tên đăng nhập hoặc email</span>
          <input
            required
            name="identifier"
            type="text"
            autoComplete="username"
            placeholder="ban@example.com"
          />
        </label>
        <label>
          <span>Mật khẩu</span>
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
          />
        </label>
        <div className="auth-form-meta">
          <span />
          <a href="/forgot-password">Quên mật khẩu?</a>
        </div>
        {message && <p className="auth-message auth-message-error" role="alert">{message}</p>}
        <button
          className="auth-submit"
          disabled={!hydrated || isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </AuthShell>
  );
}
