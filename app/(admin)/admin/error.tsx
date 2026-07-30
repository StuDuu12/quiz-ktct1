"use client";

import { WarningCircle } from "@phosphor-icons/react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="admin-error" role="alert">
      <WarningCircle size={30} weight="duotone" aria-hidden="true" />
      <div>
        <h2>Không thể hoàn tất yêu cầu</h2>
        <p>{error.message || "Không thể tải trang quản trị. Vui lòng thử lại sau."}</p>
        <button className="admin-secondary-button" type="button" onClick={reset}>
          Thử lại
        </button>
      </div>
    </section>
  );
}
