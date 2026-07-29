"use client";

import { useSearchParams } from "next/navigation";

export const ACCESS_DENIED_MESSAGE =
  "Bạn không có quyền truy cập khu vực vừa yêu cầu. Hệ thống đã đưa bạn về đúng không gian làm việc.";

export function AccessDeniedNotice() {
  const searchParams = useSearchParams();
  if (searchParams?.get("access") !== "denied") return null;

  return (
    <p className="access-denied-notice" role="status">
      {ACCESS_DENIED_MESSAGE}
    </p>
  );
}
