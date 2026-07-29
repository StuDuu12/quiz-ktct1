"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthShell } from "@/src/components/auth/auth-shell";
import { isE2EBrowserMode } from "@/src/e2e/browser";
import {
  getAuthErrorMessage,
  signUpStudent,
} from "@/src/lib/supabase/browser";

export default function RegisterPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
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

    if (error) {
      setMessage(getAuthErrorMessage(error, "register"));
      return;
    }
    setRegisteredEmail(String(formData.get("email") ?? ""));
    setMessage(
      "Đăng ký thành công. Hãy kiểm tra email để xác minh tài khoản trước khi đăng nhập.",
    );
  }

  return (
    <AuthShell
      eyebrow="Bắt đầu hành trình"
      title="Đăng ký học viên"
      description="Tạo tài khoản để lưu tiến độ, lịch sử và kết quả của bạn."
      footer={<p>Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>}
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>
          <span>Họ và tên</span>
          <input required name="fullName" autoComplete="name" placeholder="Nguyễn Văn A" />
        </label>
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
            autoComplete="new-password"
            placeholder="Nhập mật khẩu"
          />
        </label>
        <label>
          <span>Xác nhận mật khẩu</span>
          <input
            required
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
          />
        </label>
        <label className="auth-check">
          <input required name="terms" type="checkbox" />
          <span>Tôi đồng ý với điều khoản sử dụng.</span>
        </label>
        {message && <p className="auth-message" role="status">{message}</p>}
        {registeredEmail &&
        isE2EBrowserMode() ? (
          <Link
            href={`/api/e2e/confirm?email=${encodeURIComponent(registeredEmail)}`}
          >
            Xác minh email thử nghiệm
          </Link>
        ) : null}
        <button className="auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang tạo tài khoản…" : "Đăng ký"}
        </button>
      </form>
    </AuthShell>
  );
}
