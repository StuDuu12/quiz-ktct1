"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter, usePathname } from "next/navigation";

export function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // Mảng các đường dẫn không hiển thị nút quay lại
  const hiddenPaths = ["/login", "/dashboard", "/"];
  
  if (hiddenPaths.includes(pathname)) {
    return null;
  }

  return (
    <button
      onClick={() => router.back()}
      className="global-back-button"
      aria-label="Quay lại"
      title="Quay lại"
    >
      <ArrowLeft size={24} weight="bold" />
    </button>
  );
}
