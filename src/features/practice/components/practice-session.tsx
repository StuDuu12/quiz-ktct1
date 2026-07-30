"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Flag,
  ListNumbers,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { isE2EBrowserMode } from "@/src/e2e/browser";
import {
  answerPracticeQuestion,
  applyPracticeFeedback,
  togglePracticeFlag,
} from "@/src/features/practice/engine";
import { useModalFocus } from "@/src/features/exam/components/use-modal-focus";
import type {
  FinishPractice,
  PracticeState,
  SavePracticeAnswer,
  SavePracticeFlag,
} from "@/src/features/practice/types";

type PracticeSessionProps = {
  initialState: PracticeState;
  saveAnswer: SavePracticeAnswer;
  saveFlag: SavePracticeFlag;
  finish: FinishPractice;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    ),
  );
}

export function PracticeSession({
  initialState,
  saveAnswer,
  saveFlag,
  finish,
}: PracticeSessionProps) {
  const [state, setState] = useState(initialState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeDialogRef = useRef<HTMLButtonElement>(null);
  const reviewInvokerRef = useRef<HTMLButtonElement | null>(null);
  const navigatorInvokerRef = useRef<HTMLButtonElement | null>(null);
  const navigatorDialogRef = useRef<HTMLElement | null>(null);
  const navigatorCloseRef = useRef<HTMLButtonElement | null>(null);

  const currentIndex = state.questions.findIndex(
    (question) => question.id === state.currentQuestionId,
  );
  const currentQuestion = state.questions[currentIndex]!;
  const currentAnswer = state.answers[currentQuestion.id];
  const answeredCount = state.questions.filter(
    (question) => Boolean(state.answers[question.id]?.optionId),
  ).length;
  const flaggedCount = state.questions.filter(
    (question) => state.answers[question.id]?.flagged,
  ).length;
  const unansweredCount = state.questions.length - answeredCount;

  const goToQuestion = useCallback((index: number) => {
    setState((current) => {
      const next = current.questions[index];
      return next ? { ...current, currentQuestionId: next.id } : current;
    });
    setNavigatorOpen(false);
  }, []);

  const persistAnswer = useCallback(
    async (questionId: string, attemptQuestionId: string, optionId: string) => {
      setSaveStatus("saving");
      setError("");
      try {
        const feedback = await saveAnswer(
          state.attemptId,
          attemptQuestionId,
          optionId,
        );
        setState((current) =>
          applyPracticeFeedback(current, questionId, feedback),
        );
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
        setError("Chưa lưu được đáp án. Kiểm tra kết nối và thử lại.");
      }
    },
    [saveAnswer, state.attemptId],
  );

  const chooseOption = useCallback(
    (optionId: string) => {
      const answer = state.answers[currentQuestion.id];
      if (answer?.locked || state.status !== "in_progress") return;
      setState((current) =>
        answerPracticeQuestion(current, currentQuestion.id, optionId),
      );
      void persistAnswer(
        currentQuestion.id,
        currentQuestion.attemptQuestionId,
        optionId,
      );
    },
    [currentQuestion, persistAnswer, state.answers, state.status],
  );

  const toggleFlag = useCallback(() => {
    if (state.status !== "in_progress") return;
    const flagged = !Boolean(state.answers[currentQuestion.id]?.flagged);
    setState((current) => togglePracticeFlag(current, currentQuestion.id));
    setError("");
    void saveFlag(
      state.attemptId,
      currentQuestion.attemptQuestionId,
      flagged,
    ).catch(() => {
      setState((current) => togglePracticeFlag(current, currentQuestion.id));
      setError("Chưa lưu được cờ câu hỏi. Hãy thử lại.");
    });
  }, [currentQuestion, saveFlag, state.answers, state.attemptId, state.status]);

  const openReview = (event: ReactMouseEvent<HTMLButtonElement>) => {
    reviewInvokerRef.current = event.currentTarget;
    setReviewOpen(true);
  };

  const closeReview = useCallback(() => {
    setReviewOpen(false);
  }, []);
  const closeNavigator = useCallback(() => {
    setNavigatorOpen(false);
  }, []);

  useModalFocus({
    active: navigatorOpen,
    containerRef: navigatorDialogRef,
    initialFocusRef: navigatorCloseRef,
    invokerRef: navigatorInvokerRef,
    onClose: closeNavigator,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (reviewOpen || state.status !== "in_progress") return;
      if (isEditableTarget(event.target)) return;
      if (/^[1-4]$/.test(event.key)) {
        const option = currentQuestion.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          chooseOption(option.id);
        }
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFlag();
      } else if (event.key === "ArrowRight" && currentIndex < state.questions.length - 1) {
        event.preventDefault();
        goToQuestion(currentIndex + 1);
      } else if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        goToQuestion(currentIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    chooseOption,
    currentIndex,
    currentQuestion.options,
    goToQuestion,
    reviewOpen,
    state.questions.length,
    state.status,
    toggleFlag,
  ]);

  useEffect(() => {
    if (!reviewOpen) return;
    const invoker = reviewInvokerRef.current;
    closeDialogRef.current?.focus();

    const onModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReview();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
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

    document.addEventListener("keydown", onModalKeyDown);
    return () => {
      document.removeEventListener("keydown", onModalKeyDown);
      invoker?.focus();
    };
  }, [closeReview, reviewOpen]);

  const navigator = useMemo(
    () => (
      <nav className="question-navigator" aria-label="Danh sách câu hỏi">
        <div className="navigator-heading">
          <div>
            <span>Tiến độ</span>
            <strong>{answeredCount}/{state.questions.length} câu</strong>
          </div>
          <button
            ref={navigatorCloseRef}
            className="icon-button navigator-close"
            type="button"
            aria-label="Đóng danh sách câu hỏi"
            onClick={closeNavigator}
          >
            <X size={20} />
          </button>
        </div>
        <div className="navigator-grid">
          {state.questions.map((question, index) => {
            const answer = state.answers[question.id];
            const current = question.id === currentQuestion.id;
            const status = answer?.optionId ? "đã trả lời" : "chưa trả lời";
            const flagLabel = answer?.flagged ? ", đặt cờ" : "";
            return (
              <button
                key={question.id}
                type="button"
                className={[
                  "navigator-item",
                  answer?.optionId ? "is-answered" : "",
                  answer?.flagged ? "is-flagged" : "",
                  current ? "is-current" : "",
                ].filter(Boolean).join(" ")}
                aria-label={`Câu ${index + 1}, ${status}${flagLabel}`}
                aria-current={current ? "step" : undefined}
                onClick={() => goToQuestion(index)}
              >
                {index + 1}
                {answer?.flagged ? <Flag size={11} weight="fill" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        <div className="navigator-legend" aria-label="Chú thích trạng thái">
          <span><i className="legend-current" /> Hiện tại</span>
          <span><i className="legend-answered" /> Đã trả lời</span>
          <span><i className="legend-flagged" /> Đặt cờ</span>
        </div>
      </nav>
    ),
    [
      answeredCount,
      closeNavigator,
      currentQuestion.id,
      goToQuestion,
      state.answers,
      state.questions,
    ],
  );

  const confirmFinish = async () => {
    setFinishing(true);
    setError("");
    try {
      const result = await finish(state.attemptId);
      setScore(result.score);
      setState((current) => ({ ...current, status: result.status }));
      closeReview();
    } catch {
      setError("Không thể hoàn thành lượt luyện tập. Hãy thử lại.");
    } finally {
      setFinishing(false);
    }
  };

  if (state.status === "expired") {
    return (
      <main className="practice-complete practice-expired">
        <section aria-labelledby="practice-expired-title">
          <WarningCircle size={54} weight="duotone" />
          <p className="practice-kicker">PHIÊN ĐÃ HẾT HẠN</p>
          <h1 id="practice-expired-title">Lượt luyện tập đã hết hạn</h1>
          <p>
            Thời hạn do máy chủ xác định. Các câu đã lưu vẫn được giữ trong
            lịch sử, và bạn có thể bắt đầu một lượt mới cho chương này.
          </p>
          <Link
            href={`/courses/${state.courseSlug}/chapters/${state.chapterPosition}/practice`}
          >
            Bắt đầu lượt mới <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    );
  }

  if (state.status === "submitted" || score !== null) {
    const completedScore = score ?? state.score ?? 0;
    return (
      <main className="practice-complete">
        <section aria-labelledby="practice-complete-title">
          <CheckCircle size={54} weight="duotone" />
          <p className="practice-kicker">ĐÃ HOÀN THÀNH</p>
          <h1 id="practice-complete-title">Lượt luyện tập đã được lưu</h1>
          <p>
            Kết quả của bạn: <strong>{Math.round(completedScore)}%</strong>.
            Tiến độ chương sẽ được cập nhật trên trang học phần.
          </p>
          <div className="completion-actions">
            <Link href={`/results/${state.attemptId}`}>
              Xem chi tiết kết quả <ArrowRight size={18} />
            </Link>
            <Link href={`/courses/${state.courseSlug}`}>
              Trở về học phần
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <main
        className="practice-shell"
        inert={reviewOpen || navigatorOpen ? true : undefined}
      >
        {isE2EBrowserMode() ? (
          <input
            type="text"
            aria-label="Kiểm tra phím tắt khi nhập"
            data-e2e-shortcut-probe
          />
        ) : null}
        <header className="practice-header">
        <Link
          href={`/courses/${state.courseSlug}`}
          className="practice-brand"
          aria-label="Trở về học phần"
        >
          <BookOpen size={23} weight="fill" />
          <span>Ôn thi KTCT</span>
        </Link>
        <div className="practice-chapter">
          <span>Chương {state.chapterPosition}</span>
          <strong>{state.chapterTitle}</strong>
        </div>
        <div className={`save-indicator save-${saveStatus}`} aria-live="polite">
          {saveStatus === "saving"
            ? "Đang lưu…"
            : saveStatus === "error"
              ? "Lỗi lưu"
              : saveStatus === "saved"
                ? "Đã lưu"
                : "Lưu tự động"}
        </div>
      </header>

      <div className="practice-layout">
        <section
          className="practice-question-card"
          aria-labelledby="practice-question-title"
        >
          <div className="question-toolbar">
            <span>Câu {currentIndex + 1} / {state.questions.length}</span>
            <button
              type="button"
              className={currentAnswer?.flagged ? "flag-button is-active" : "flag-button"}
              aria-pressed={Boolean(currentAnswer?.flagged)}
              onClick={toggleFlag}
            >
              <Flag
                size={18}
                weight={currentAnswer?.flagged ? "fill" : "regular"}
              />
              {currentAnswer?.flagged ? "Đã đặt cờ" : "Đặt cờ"}
              <kbd>F</kbd>
            </button>
          </div>

          <h1 id="practice-question-title">{currentQuestion.content}</h1>
          <fieldset className="option-list">
            <legend className="visually-hidden">Các phương án trả lời</legend>
            {currentQuestion.options.map((option, index) => {
              const selected = currentAnswer?.optionId === option.id;
              const correctness =
                selected && currentAnswer?.isCorrect === true
                  ? " is-correct"
                  : selected && currentAnswer?.isCorrect === false
                    ? " is-incorrect"
                    : "";
              return (
                <label
                  key={option.id}
                  className={`practice-option${selected ? " is-selected" : ""}${correctness}${currentAnswer?.locked ? " is-disabled" : ""}`}
                >
                  <input
                    className="native-option-input"
                    type="radio"
                    name="practice-answer"
                      value={option.id}
                      aria-label={`Phương án ${option.label}: ${option.content}`}
                      aria-checked={selected}
                      checked={selected}
                    disabled={Boolean(currentAnswer?.locked)}
                    onChange={() => chooseOption(option.id)}
                  />
                  <span className="option-key">{index + 1}</span>
                  <span className="option-label">{option.content}</span>
                  <span className="option-letter">{option.label}</span>
                </label>
              );
            })}
          </fieldset>

          {currentAnswer?.showFeedback &&
          typeof currentAnswer.isCorrect === "boolean" ? (
            <section
              className={currentAnswer.isCorrect ? "feedback feedback-correct" : "feedback feedback-incorrect"}
              aria-live="polite"
            >
              {currentAnswer.isCorrect ? (
                <CheckCircle size={23} weight="fill" />
              ) : (
                <XCircle size={23} weight="fill" />
              )}
              <div>
                <strong>{currentAnswer.isCorrect ? "Chính xác" : "Chưa chính xác"}</strong>
                <p>{currentAnswer.explanation || "Chưa có lời giải cho câu hỏi này."}</p>
                {!currentAnswer.isCorrect && currentAnswer.correctOptionId ? (
                  <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                    Đáp án đúng là: {currentQuestion.options.find(o => o.id === currentAnswer.correctOptionId)?.content}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="practice-error" role="alert">
              <WarningCircle size={20} />
              <span>{error}</span>
              {saveStatus === "error" && currentAnswer?.optionId ? (
                <button
                  type="button"
                  onClick={() =>
                    void persistAnswer(
                      currentQuestion.id,
                      currentQuestion.attemptQuestionId,
                      currentAnswer.optionId!,
                    )
                  }
                >
                  Thử lại
                </button>
              ) : null}
            </div>
          ) : null}

          <footer className="question-actions">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => goToQuestion(currentIndex - 1)}
            >
              <ArrowLeft size={18} /> Câu trước
            </button>
            {currentIndex < state.questions.length - 1 ? (
              <button
                type="button"
                className="next-button"
                onClick={() => goToQuestion(currentIndex + 1)}
              >
                Câu tiếp <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="finish-button"
                onClick={openReview}
              >
                Kết thúc
              </button>
            )}
          </footer>
          <button
            type="button"
            className="finish-link"
            onClick={openReview}
          >
            Kết thúc
          </button>
        </section>

        <aside className="practice-navigator-panel">{navigator}</aside>
      </div>

      <button
        ref={navigatorInvokerRef}
        type="button"
        className="mobile-navigator-button"
        aria-expanded={navigatorOpen}
        onClick={() => setNavigatorOpen(true)}
      >
        <ListNumbers size={20} />
        Danh sách câu
        <strong>{answeredCount}/{state.questions.length}</strong>
      </button>
    </main>

      {navigatorOpen ? (
        <div
          className="mobile-navigator-backdrop"
          role="presentation"
          onClick={closeNavigator}
        >
          <section
            ref={navigatorDialogRef}
            className="mobile-navigator-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Danh sách câu hỏi trên thiết bị di động"
            onClick={(event) => event.stopPropagation()}
          >
            {navigator}
          </section>
        </div>
      ) : null}

      {reviewOpen ? (
        <div className="practice-modal-backdrop">
          <section
            ref={dialogRef}
            className="practice-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-review-title"
          >
            <button
              ref={closeDialogRef}
              type="button"
              className="icon-button modal-close"
              aria-label="Đóng rà soát"
              onClick={closeReview}
            >
              <X size={21} />
            </button>
            <p className="practice-kicker">RÀ SOÁT</p>
            <h2 id="practice-review-title">Rà soát lượt luyện tập</h2>
            <p>Bạn chỉ có thể xem, không thể đổi đáp án đã gửi.</p>
            <div className="review-summary">
              <div><strong>{answeredCount}</strong><span>{answeredCount} câu đã trả lời</span></div>
              <div><strong>{unansweredCount}</strong><span>{unansweredCount} câu chưa trả lời</span></div>
              <div><strong>{flaggedCount}</strong><span>{flaggedCount} câu đặt cờ</span></div>
            </div>
            <div className="review-actions">
              <button type="button" onClick={closeReview}>
                Quay lại kiểm tra
              </button>
              <button
                type="button"
                className="finish-button"
                disabled={finishing}
                onClick={() => void confirmFinish()}
              >
                {finishing ? "Đang hoàn thành…" : "Xác nhận hoàn thành"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
