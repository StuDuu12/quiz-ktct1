"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    router.replace("/");
  }

  return (
    <main className="app-shell">
      <h1>Đăng nhập</h1>
      <form action={onSubmit} className="grid gap-4" noValidate>
        <label>
          Email
          <input required name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Mật khẩu
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
          />
        </label>
        {message && <p role="alert">{message}</p>}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
      <p>
        <Link href="/forgot-password">Quên mật khẩu?</Link>
      </p>
      <p>
        Chưa có tài khoản? <Link href="/register">Đăng ký học viên</Link>
      </p>
    </main>
  );
}
