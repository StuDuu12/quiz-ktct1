"use client";

import { BookOpenText, List, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AdminNavigation } from "@/src/features/admin/components/admin-navigation";
import type { AppRole } from "@/src/features/auth/roles";

export function AdminShell({
  role,
  email,
  children,
}: {
  role: AppRole;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="admin-shell">
      <a className="admin-skip-link" href="#admin-main">
        Chuyển đến nội dung
      </a>
      <aside className={mobileOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <div className="admin-brand">
          <BookOpenText size={27} weight="fill" aria-hidden="true" />
          <div>
            <strong>KTCT Portal</strong>
            <span>{role === "admin" ? "Quản trị viên" : "Giảng viên"}</span>
          </div>
        </div>
        <AdminNavigation role={role} currentPath={pathname} />
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
            aria-label="Mở điều hướng quản trị"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <List size={24} weight="bold" aria-hidden="true" />
          </button>
          <strong>KTCT Portal</strong>
          <span>{role === "admin" ? "Admin" : "Giảng viên"}</span>
        </header>
        <main id="admin-main" className="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
