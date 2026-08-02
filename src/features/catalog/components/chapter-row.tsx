import { ArrowRight, BookOpen, CheckCircle, Clock, CaretDown, ClipboardText } from "@phosphor-icons/react/ssr";
import { DeleteAttemptButton } from "./delete-attempt-button";
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
  const practiceHref = `/courses/${courseSlug}/chapters/${chapter.position}/practice`;
  return (
    <details className="chapter-accordion">
      <summary className="chapter-row">
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
      <div className="chapter-action-group">
        <Link className="practice-link" href={practiceHref}>
          {ready || chapter.activeAttemptId ? <CheckCircle size={18} weight="fill" /> : null}
          Luyện tập <ArrowRight size={16} />
        </Link>
        <div className="chapter-accordion-icon"><CaretDown size={20} weight="bold" /></div>
      </div>
      </summary>
      <div className="chapter-history-content">
        <h4>Lịch sử làm bài:</h4>
        {(!chapter.history || chapter.history.length === 0) ? (
          <div className="empty-state" style={{ padding: '1rem', marginTop: 0 }}>
             <p style={{ margin: 0 }}>Chưa có lịch sử làm bài cho chương này.</p>
          </div>
        ) : (
          <div className="attempt-list">
            {[...chapter.history].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).map(attempt => (
              <article key={attempt.id} className="attempt-row" style={{ borderBottom: '1px solid #e8f0f0' }}>
                <div className="attempt-icon"><ClipboardText size={19} weight="duotone" /></div>
                <div className="attempt-identity">
                  <strong>Luyện tập</strong>
                  <p>{formatDate(attempt.submittedAt)}</p>
                </div>
                <span className={`status-pill status-${attempt.status}`}>
                  {attempt.status === "submitted" ? "Đã nộp" : attempt.status === "expired" ? "Hết giờ" : "Đang làm"}
                </span>
                <strong className="attempt-score">
                  {attempt.score === null ? "—" : `${Math.round(attempt.score)}%`}
                </strong>
                <div className="attempt-actions">
                  {attempt.status === "submitted" ? (
                    <Link className="attempt-action" href={`/results/${attempt.id}`}>
                      Xem lại <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  ) : attempt.status === "in_progress" ? (
                    <Link className="attempt-action" href={`${practiceHref}?attempt=${attempt.id}`}>
                      Tiếp tục <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
                <div className="attempt-delete">
                  <DeleteAttemptButton attemptId={attempt.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
