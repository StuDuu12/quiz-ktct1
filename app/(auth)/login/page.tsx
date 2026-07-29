"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/src/components/auth/auth-shell";
import { getAuthErrorMessage, signIn } from "@/src/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);
    const { error } = await signIn(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
    setIsSubmitting(false);

    if (error) {
      setMessage(getAuthErrorMessage(error, "signin"));
      return;
    }
    router.replace("/dashboard");
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
      <form action={onSubmit} className="auth-form" noValidate>
        <label>
          <span>Email</span>
          <input required name="email" type="email" autoComplete="email" placeholder="ban@example.com" />
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
          <Link href="/forgot-password">Quên mật khẩu?</Link>
        </div>
        {message && <p className="auth-message auth-message-error" role="alert">{message}</p>}
        <button className="auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </AuthShell>
  );
}
