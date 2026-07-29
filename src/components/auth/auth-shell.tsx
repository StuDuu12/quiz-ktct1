import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="Giới thiệu học phần">
        <Link className="auth-brand" href="/">
          <span aria-hidden="true">KT</span>
          <strong>Phòng luyện thi KTCT</strong>
        </Link>
        <div className="auth-brand-copy">
          <p className="auth-kicker">Kinh tế chính trị Mác – Lênin</p>
          <h2>Học có lộ trình, thi có chiến lược.</h2>
          <p>
            497 câu hỏi đã đối chiếu đáp án, chia theo 6 chương và một chế độ
            thi thử 40 câu trong 60 phút.
          </p>
        </div>
        <div className="auth-proof" aria-label="Thông tin học phần">
          <span><strong>497</strong> câu hỏi</span>
          <span><strong>06</strong> chương</span>
          <span><strong>60&apos;</strong> thi thử</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <Link className="auth-mobile-brand" href="/">KTCT</Link>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}
