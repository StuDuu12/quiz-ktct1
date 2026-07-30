"use client";

import { BookOpenText, List, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { AdminNavigation } from "@/src/features/admin/components/admin-navigation";
import { AccessDeniedNotice } from "@/src/features/auth/components/access-denied-notice";
import { SignOutButton } from "@/src/features/auth/components/sign-out-button";

const subscribeToHydration = () => () => {};

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="admin-shell" data-hydrated={hydrated ? "true" : "false"}>
      <a className="admin-skip-link" href="#admin-main">
        Chuyển đến nội dung
      </a>
      <aside className={mobileOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <div className="admin-brand">
          <BookOpenText size={27} weight="fill" aria-hidden="true" />
          <div>
            <strong>KTCT Portal</strong>
            <span>Quản trị viên</span>
          </div>
        </div>
        <AdminNavigation role="admin" currentPath={pathname} />
        <div className="admin-sidebar-footer">
          <span title={email}>{email}</span>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              Về trang học
            </Link>
            <SignOutButton />
          </div>
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
        <AccessDeniedNotice />
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
          <span>Admin</span>
        </header>
        <main id="admin-main" className="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
