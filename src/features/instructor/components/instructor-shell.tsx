"use client";

import { BookOpenText, List, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { InstructorNavigation } from "@/src/features/instructor/components/instructor-navigation";

export function InstructorShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="admin-shell">
      <a className="admin-skip-link" href="#instructor-main">
        Chuyển đến nội dung
      </a>
      <aside className={mobileOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <div className="admin-brand">
          <BookOpenText size={27} weight="fill" aria-hidden="true" />
          <div>
            <strong>KTCT Portal</strong>
            <span>Giảng viên</span>
          </div>
        </div>
        <InstructorNavigation currentPath={pathname} />
        <div className="admin-sidebar-footer">
          <span title={email}>{email}</span>
          <Link href="/dashboard">
            <SignOut size={18} aria-hidden="true" />
            Về trang học
          </Link>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          aria-label="Đóng điều hướng"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <div className="admin-stage">
        <header className="admin-mobile-header">
          <button
            type="button"
            aria-label="Mở điều hướng giảng viên"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <List size={24} weight="bold" aria-hidden="true" />
          </button>
          <strong>KTCT Portal</strong>
          <span>Giảng viên</span>
        </header>
        <main id="instructor-main" className="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
