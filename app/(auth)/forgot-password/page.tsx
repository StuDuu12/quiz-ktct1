"use client";

import Link from "next/link";
import { useState } from "react";

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
    <main className="app-shell">
      <h1>Đặt lại mật khẩu</h1>
      <form action={onSubmit} className="grid gap-4" noValidate>
        <label>
          Email
          <input required name="email" type="email" autoComplete="email" />
        </label>
        {message && <p role="status">{message}</p>}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang gửi…" : "Gửi liên kết đặt lại"}
        </button>
      </form>
      <p>
        <Link href="/login">Quay lại đăng nhập</Link>
      </p>
    </main>
  );
}
