"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/src/components/auth/auth-shell";
import {
  getAuthErrorMessage,
  requestPasswordReset,
} from "@/src/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);
    const { error } = await requestPasswordReset(
      String(formData.get("email") ?? ""),
      window.location.origin,
    );
    setIsSubmitting(false);
    setMessage(
      error
        ? getAuthErrorMessage(error, "reset")
        : "Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu.",
    );
  }

  return (
    <AuthShell
      eyebrow="Khôi phục truy cập"
      title="Đặt lại mật khẩu"
      description="Nhập email tài khoản. Chúng tôi sẽ gửi cho bạn một liên kết bảo mật."
      footer={<p><Link href="/login">← Quay lại đăng nhập</Link></p>}
    >
      <form action={onSubmit} className="auth-form" noValidate>
        <label>
          <span>Email</span>
          <input required name="email" type="email" autoComplete="email" placeholder="ban@example.com" />
        </label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang gửi…" : "Gửi liên kết đặt lại"}
        </button>
      </form>
    </AuthShell>
  );
}
