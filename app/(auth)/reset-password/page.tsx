"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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

  async function onSubmit(formData: FormData) {
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
    <main className="app-shell">
      <h1>Chọn mật khẩu mới</h1>
      <form action={onSubmit} className="grid gap-4" noValidate>
        <label>
          Mật khẩu mới
          <input
            required
            minLength={8}
            name="password"
            type="password"
            autoComplete="new-password"
          />
        </label>
        <label>
          Xác nhận mật khẩu mới
          <input
            required
            minLength={8}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
          />
        </label>
        {message && <p role="alert">{message}</p>}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
        </button>
      </form>
      <p>
        <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
      </p>
    </main>
  );
}
