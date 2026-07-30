import { ArrowRight, BookOpen, CheckCircle, Clock } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import type { ChapterSummary } from "@/src/features/catalog/queries";

function formatDate(value: string | null) {
  if (!value) return "Chưa có lượt làm";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value),
  );
}

export function ChapterRow({ chapter, courseSlug }: { chapter: ChapterSummary; courseSlug: string }) {
  const ready = chapter.accuracy !== null;
  const practiceHref = chapter.activeAttemptId
    ? `/courses/${courseSlug}/chapters/${chapter.position}/practice?attempt=${chapter.activeAttemptId}`
    : `/courses/${courseSlug}/chapters/${chapter.position}/practice`;
  return (
    <article className="chapter-row">
      <div className="chapter-number" aria-hidden="true">{String(chapter.position).padStart(2, "0")}</div>
      <div className="chapter-body">
        <h3>{chapter.title}</h3>
        <p><BookOpen size={16} weight="duotone" /> {chapter.questionCount} câu hỏi</p>
      </div>
      <div className="chapter-details">
        <div className="chapter-metric">
          <span>Độ chính xác</span>
          <strong className={ready ? "metric-good" : "metric-empty"}>{ready ? `${chapter.accuracy}%` : "—"}</strong>
          {ready && <small>{chapter.attempts} lượt đã nộp</small>}
        </div>
        <div className="chapter-latest">
          <span><Clock size={15} /> Lần gần nhất</span>
          <strong>{formatDate(chapter.latestAttemptAt)}</strong>
        </div>
      </div>
      <Link className="practice-link" href={practiceHref}>
        {ready || chapter.activeAttemptId ? <CheckCircle size={18} weight="fill" /> : null}
        {chapter.activeAttemptId ? "Tiếp tục" : "Luyện tập"} <ArrowRight size={16} />
      </Link>
    </article>
  );
}
