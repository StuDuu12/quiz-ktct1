"use client";

import { WarningCircle } from "@phosphor-icons/react";

export default function AdminError({
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
        <p>Không có dữ liệu giả hoặc thông báo thành công giả được hiển thị.</p>
        <button className="admin-secondary-button" type="button" onClick={reset}>
          Thử lại
        </button>
      </div>
    </section>
  );
}
