import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";

import type { AttemptSummary } from "@/src/features/history/queries";

type HistoryListProps = {
  attempts: AttemptSummary[];
  page: number;
  pageSize: number;
  filters: Record<string, string | undefined>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Chưa hoàn thành";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} phút ${remainder.toString().padStart(2, "0")} giây`;
}

function pageHref(
  filters: Record<string, string | undefined>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

function statusLabel(status: AttemptSummary["status"]) {
  if (status === "submitted") return "Đã nộp";
  if (status === "expired") return "Hết hạn";
  return "Đang làm";
}

export function HistoryList({
  attempts,
  page,
  pageSize,
  filters,
}: HistoryListProps) {
  if (attempts.length === 0) {
    return (
      <section className="history-empty" aria-labelledby="history-empty-title">
        <FileText size={34} weight="duotone" aria-hidden="true" />
        <div>
          <h2 id="history-empty-title">Chưa có lượt làm phù hợp</h2>
          <p>Hãy thay đổi bộ lọc hoặc bắt đầu một lượt luyện tập mới.</p>
        </div>
      </section>
    );
  }

  const totalCount = attempts[0]!.totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <div className="history-results" aria-label="Danh sách lượt làm">
        {attempts.map((attempt) => (
          <article className="history-card" key={attempt.id}>
            <div className="history-card-icon" aria-hidden="true">
              {attempt.status === "submitted" ? (
                <CheckCircle size={23} weight="duotone" />
              ) : attempt.status === "expired" ? (
                <WarningCircle size={23} weight="duotone" />
              ) : (
                <Clock size={23} weight="duotone" />
              )}
            </div>
            <div className="history-card-main">
              <p className="history-kind">
                {attempt.kind === "mock_exam"
                  ? "Thi thử tổng hợp"
                  : "Luyện tập theo chương"}
              </p>
              <h2>{attempt.chapterTitle ?? attempt.courseTitle}</h2>
              <p>
                {formatDate(attempt.submittedAt ?? attempt.startedAt)}
                <span aria-hidden="true"> · </span>
                {attempt.questionCount} câu
                <span aria-hidden="true"> · </span>
                {formatDuration(attempt.durationSeconds)}
              </p>
            </div>
            <div className="history-card-result">
              <span className={`history-status history-status-${attempt.status}`}>
                {statusLabel(attempt.status)}
              </span>
              <strong>
                {attempt.score === null
                  ? "Chưa có điểm"
                  : `${Math.round(attempt.score * 100) / 100}%`}
              </strong>
            </div>
            {attempt.status === "submitted" ? (
              <Link
                className="history-result-link"
                href={`/results/${attempt.id}`}
              >
                Xem kết quả <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ) : null}
          </article>
        ))}
      </div>
      {totalPages > 1 ? (
        <nav className="history-pagination" aria-label="Phân trang lịch sử">
          {page > 1 ? (
            <Link href={pageHref(filters, page - 1)}>
              <ArrowLeft size={17} aria-hidden="true" /> Trang trước
            </Link>
          ) : (
            <span />
          )}
          <p>
            Trang <strong>{page}</strong> / {totalPages}
          </p>
          {page < totalPages ? (
            <Link href={pageHref(filters, page + 1)}>
              Trang sau <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
