"use client";

import { Flag, WarningCircle, X } from "@phosphor-icons/react";
import { useRef } from "react";
import type { RefObject } from "react";

import type { ReviewSummary } from "@/src/features/exam/review";
import { useModalFocus } from "@/src/features/exam/components/use-modal-focus";

type ReviewDialogProps = {
  summary: ReviewSummary;
  invokerRef: RefObject<HTMLButtonElement | null>;
  submitting: boolean;
  notice?: string;
  onClose: () => void;
  onConfirm: () => void;
  onInspect: (index: number) => void;
};

export function ReviewDialog({
  summary,
  invokerRef,
  submitting,
  notice,
  onClose,
  onConfirm,
  onInspect,
}: ReviewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useModalFocus({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    invokerRef,
    onClose,
  });

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
        {notice ? (
          <div className="exam-review-notice" role="alert">
            <WarningCircle size={19} />
            <span>{notice}</span>
          </div>
        ) : null}

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
