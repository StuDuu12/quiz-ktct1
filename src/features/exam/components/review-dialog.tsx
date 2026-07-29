"use client";

import { Flag, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { ReviewSummary } from "@/src/features/exam/review";

type ReviewDialogProps = {
  summary: ReviewSummary;
  invokerRef: RefObject<HTMLButtonElement | null>;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onInspect: (index: number) => void;
};

export function ReviewDialog({
  summary,
  invokerRef,
  submitting,
  onClose,
  onConfirm,
  onInspect,
}: ReviewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const invoker = invokerRef.current;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      invoker?.focus();
    };
  }, [invokerRef, onClose]);

  return (
    <div className="exam-modal-backdrop">
      <section
        ref={dialogRef}
        className="exam-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-review-title"
        aria-describedby="exam-review-description"
      >
        <header className="exam-review-header">
          <div>
            <p className="exam-kicker">RÀ SOÁT CUỐI</p>
            <h2 id="exam-review-title">Rà soát trước khi nộp bài</h2>
            <p id="exam-review-description">
              Kiểm tra từng lựa chọn bên dưới. Bài chỉ được nộp sau khi bạn xác
              nhận lần cuối.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="exam-icon-button"
            aria-label="Đóng rà soát"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>

        <div className="exam-review-counts">
          <div>
            <strong>{summary.answeredCount}</strong>
            <span>{summary.answeredCount} câu đã trả lời</span>
          </div>
          <div>
            <strong>{summary.unansweredCount}</strong>
            <span>{summary.unansweredCount} câu chưa trả lời</span>
          </div>
          <div>
            <strong>{summary.flaggedCount}</strong>
            <span>{summary.flaggedCount} câu đặt cờ</span>
          </div>
        </div>

        <ol className="exam-review-list">
          {summary.questions.map((question, index) => (
            <li key={question.questionId}>
              <button
                type="button"
                aria-label={`Xem câu ${question.questionNumber}`}
                onClick={() => onInspect(index)}
              >
                <span className="exam-review-number">
                  {question.questionNumber}
                </span>
                <span className="exam-review-answer">
                  <strong>{question.content}</strong>
                  <span>
                    {question.selectedOption
                      ? `${question.selectedOption.label}. ${question.selectedOption.content}`
                      : "Chưa chọn phương án"}
                  </span>
                </span>
                {question.flagged ? (
                  <span className="exam-review-flag">
                    <Flag size={15} weight="fill" /> Đặt cờ
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>

        <footer className="exam-review-actions">
          <button type="button" onClick={onClose}>
            Quay lại làm bài
          </button>
          <button
            type="button"
            className="exam-submit-button"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? "Đang nộp bài…" : "Xác nhận nộp bài"}
          </button>
        </footer>
      </section>
    </div>
  );
}
