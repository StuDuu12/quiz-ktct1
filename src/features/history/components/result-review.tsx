"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Flag,
  MinusCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AttemptResult,
  ResultOption,
} from "@/src/features/history/queries";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} phút ${remainder.toString().padStart(2, "0")} giây`;
}

function optionText(
  options: ResultOption[],
  optionId: string | null,
  fallback: string,
) {
  const option = options.find((item) => item.id === optionId);
  return option ? `${option.label}. ${option.content}` : fallback;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches("input, textarea, select, [contenteditable='true']") ||
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function ResultReview({ result }: { result: AttemptResult }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const questionRefs = useRef<Array<HTMLElement | null>>([]);
  const totalQuestions = result.questions.length;
  const correct = result.questions.filter((question) => question.isCorrect)
    .length;
  const unanswered = result.questions.filter(
    (question) => question.isUnanswered,
  ).length;
  const incorrect = result.questions.length - correct - unanswered;

  const goToQuestion = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalQuestions) return;
      currentIndexRef.current = index;
      setCurrentIndex(index);

      const schedule = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
      schedule(() => {
        const target = questionRefs.current[index];
        const reducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        target?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
        });
        target?.focus({ preventScroll: true });
      });
    },
    [totalQuestions],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isEditableTarget(event.target) ||
        isEditableTarget(document.activeElement)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToQuestion(currentIndexRef.current - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToQuestion(currentIndexRef.current + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToQuestion]);

  return (
    <div className="result-review">
      <section className="result-summary" aria-labelledby="result-title">
        <div>
          <p className="result-kicker">
            {result.kind === "mock_exam"
              ? "KẾT QUẢ THI THỬ"
              : "KẾT QUẢ LUYỆN TẬP"}
          </p>
          <h1 id="result-title">Bài làm đã được chấm</h1>
          <p>
            Đáp án và lời giải dưới đây được lấy từ bản chụp bất biến tại thời
            điểm lượt làm được tạo.
          </p>
        </div>
        <div className="result-score" aria-label={`Điểm ${result.score}%`}>
          <span>Điểm số</span>
          <strong>{Math.round(result.score * 100) / 100}%</strong>
          <small>{formatDuration(result.durationSeconds)}</small>
        </div>
      </section>

      <section className="result-counts" aria-label="Thống kê bài làm">
        <div className="result-count-success">
          <CheckCircle size={22} weight="fill" aria-hidden="true" />
          <span>Trả lời đúng</span>
          <strong>{correct}</strong>
        </div>
        <div className="result-count-danger">
          <XCircle size={22} weight="fill" aria-hidden="true" />
          <span>Trả lời sai</span>
          <strong>{incorrect}</strong>
        </div>
        <div className="result-count-neutral">
          <MinusCircle size={22} weight="fill" aria-hidden="true" />
          <span>Chưa trả lời</span>
          <strong>{unanswered}</strong>
        </div>
      </section>

      <nav
        className="result-review-navigation"
        aria-label="Điều hướng câu hỏi xem lại"
      >
        <button
          type="button"
          aria-keyshortcuts="ArrowLeft"
          disabled={currentIndex === 0}
          onClick={() => goToQuestion(currentIndex - 1)}
        >
          <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          Câu trước
        </button>
        <strong aria-live="polite">
          Câu {currentIndex + 1} / {totalQuestions}
        </strong>
        <button
          type="button"
          aria-keyshortcuts="ArrowRight"
          disabled={currentIndex >= totalQuestions - 1}
          onClick={() => goToQuestion(currentIndex + 1)}
        >
          Câu tiếp
          <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </button>
      </nav>

      <ol className="result-questions" aria-label="Chi tiết từng câu">
        {result.questions.map((question, index) => {
          const state = question.isUnanswered
            ? "unanswered"
            : question.isCorrect
              ? "correct"
              : "incorrect";
          const label =
            state === "correct"
              ? "Trả lời đúng"
              : state === "incorrect"
                ? "Trả lời sai"
                : "Chưa trả lời";
          const StatusIcon =
            state === "correct"
              ? CheckCircle
              : state === "incorrect"
                ? XCircle
                : MinusCircle;

          return (
            <li
              className={`result-question result-question-${state}`}
              key={question.attemptQuestionId}
            >
              <article
                ref={(node) => {
                  questionRefs.current[index] = node;
                }}
                aria-current={index === currentIndex ? "step" : undefined}
                aria-labelledby={`result-question-${question.position}`}
                data-result-question={question.position}
                tabIndex={-1}
              >
                <header>
                  <span className="result-question-number">
                    Câu {question.position}
                  </span>
                  <span className="result-question-state">
                    <StatusIcon size={18} weight="fill" aria-hidden="true" />
                    {label}
                  </span>
                  {question.isFlagged ? (
                    <span className="result-question-flag">
                      <Flag size={17} weight="fill" aria-hidden="true" />
                      Đã đặt cờ
                    </span>
                  ) : null}
                </header>
                <h2 id={`result-question-${question.position}`}>
                  {question.content}
                </h2>
                <div className="result-answer-grid">
                  <p>
                    <span>Bạn chọn</span>
                    <strong>
                      Bạn chọn:{" "}
                      {optionText(
                        question.options,
                        question.selectedOptionId,
                        "Không chọn đáp án",
                      )}
                    </strong>
                  </p>
                  <p>
                    <span>Đáp án đúng</span>
                    <strong>
                      Đáp án đúng:{" "}
                      {optionText(
                        question.options,
                        question.correctOptionId,
                        "Không xác định",
                      )}
                    </strong>
                  </p>
                </div>
                <div className="result-explanation">
                  <strong>Lời giải</strong>
                  <p>{question.explanation}</p>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
