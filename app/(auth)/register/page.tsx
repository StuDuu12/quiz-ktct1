"use client";

import Link from "next/link";
import { useState } from "react";

import {
  getAuthErrorMessage,
  signUpStudent,
} from "@/src/lib/supabase/browser";

export default function RegisterPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setMessage("Xác nhận mật khẩu chưa khớp.");
      return;
    }
    if (formData.get("terms") !== "on") {
      setMessage("Bạn cần đồng ý với điều khoản sử dụng.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    const { error } = await signUpStudent({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password,
      origin: window.location.origin,
    });
    setIsSubmitting(false);

    setMessage(
      error
        ? getAuthErrorMessage(error, "register")
        : "Đăng ký thành công. Hãy kiểm tra email để xác minh tài khoản trước khi đăng nhập.",
    );
  }

  return (
    <main className="app-shell">
      <h1>Đăng ký học viên</h1>
      <form action={onSubmit} className="grid gap-4" noValidate>
        <label>
          Họ và tên
          <input required name="fullName" autoComplete="name" />
        </label>
        <label>
          Email
          <input required name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Mật khẩu
          <input
            required
            minLength={8}
            name="password"
            type="password"
            autoComplete="new-password"
          />
        </label>
        <label>
          Xác nhận mật khẩu
          <input
            required
            minLength={8}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
          />
        </label>
        <label>
          <input required name="terms" type="checkbox" /> Tôi đồng ý với điều
          khoản sử dụng.
        </label>
        {message && <p role="status">{message}</p>}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang tạo tài khoản…" : "Đăng ký"}
        </button>
      </form>
      <p>
        Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
      </p>
    </main>
  );
}
