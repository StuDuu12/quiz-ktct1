"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthShell } from "@/src/components/auth/auth-shell";
import {
  createBrowserSupabaseClient,
  getAuthErrorMessage,
} from "@/src/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(
    searchParams.get("error") === "expired-reset"
      ? "Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu một liên kết mới."
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("confirmPassword") ?? "")) {
      setMessage("Xác nhận mật khẩu chưa khớp.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.updateUser({
      password,
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(getAuthErrorMessage(error, "reset"));
      return;
    }
    router.replace("/login");
  }

  return (
    <AuthShell
      eyebrow="Bảo mật tài khoản"
      title="Chọn mật khẩu mới"
      description="Dùng ít nhất 8 ký tự và tránh sử dụng lại mật khẩu cũ."
      footer={<p><Link href="/forgot-password">Yêu cầu liên kết mới</Link></p>}
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>
          <span>Mật khẩu mới</span>
          <input
            required
            minLength={8}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
          />
        </label>
        <label>
          <span>Xác nhận mật khẩu mới</span>
          <input
            required
            minLength={8}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
          />
        </label>
        {message && <p className="auth-message auth-message-error" role="alert">{message}</p>}
        <button className="auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
        </button>
      </form>
    </AuthShell>
  );
}
