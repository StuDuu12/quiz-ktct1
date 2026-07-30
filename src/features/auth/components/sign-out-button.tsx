"use client";

import { SignOut } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/src/lib/supabase/browser";

export function SignOutButton({ className, label = "Đăng xuất", showIcon = true }: { className?: string; label?: string; showIcon?: boolean }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      className={className}
      onClick={handleSignOut}
      disabled={isSigningOut}
      type="button"
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "none", border: "none", cursor: "pointer", color: "inherit", font: "inherit", padding: 0 }}
    >
      {showIcon && <SignOut size={18} aria-hidden="true" />}
      {isSigningOut ? "Đang xử lý..." : label}
    </button>
  );
}
