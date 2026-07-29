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
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  answerPracticeQuestion,
  applyPracticeFeedback,
  togglePracticeFlag,
} from "@/src/features/practice/engine";
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (reviewOpen || state.status !== "in_progress") return;
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

  const navigator = useMemo(
    () => (
      <nav className="question-navigator" aria-label="Danh sách câu hỏi">
        <div className="navigator-heading">
          <div>
            <span>Tiến độ</span>
            <strong>{answeredCount}/{state.questions.length} câu</strong>
          </div>
          <button
            className="icon-button navigator-close"
            type="button"
            aria-label="Đóng danh sách câu hỏi"
            onClick={() => setNavigatorOpen(false)}
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
      setState((current) => ({ ...current, status: "submitted" }));
      setReviewOpen(false);
    } catch {
      setError("Không thể hoàn thành lượt luyện tập. Hãy thử lại.");
    } finally {
      setFinishing(false);
    }
  };

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
          <Link href={`/courses/${state.courseSlug}`}>
            Trở về học phần <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="practice-shell">
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
          <div className="option-list" role="radiogroup" aria-label="Các phương án trả lời">
            {currentQuestion.options.map((option, index) => {
              const selected = currentAnswer?.optionId === option.id;
              const correctness =
                selected && currentAnswer?.isCorrect === true
                  ? " is-correct"
                  : selected && currentAnswer?.isCorrect === false
                    ? " is-incorrect"
                    : "";
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={Boolean(currentAnswer?.locked)}
                  className={`practice-option${selected ? " is-selected" : ""}${correctness}`}
                  onClick={() => chooseOption(option.id)}
                >
                  <span className="option-key">{index + 1}</span>
                  <span className="option-label">{option.content}</span>
                  <span className="option-letter">{option.label}</span>
                </button>
              );
            })}
          </div>

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
                onClick={() => setReviewOpen(true)}
              >
                Kết thúc
              </button>
            )}
          </footer>
          <button
            type="button"
            className="finish-link"
            onClick={() => setReviewOpen(true)}
          >
            Kết thúc
          </button>
        </section>

        <aside className="practice-navigator-panel">{navigator}</aside>
      </div>

      <button
        type="button"
        className="mobile-navigator-button"
        aria-expanded={navigatorOpen}
        onClick={() => setNavigatorOpen(true)}
      >
        <ListNumbers size={20} />
        Danh sách câu
        <strong>{answeredCount}/{state.questions.length}</strong>
      </button>
      {navigatorOpen ? (
        <div className="mobile-navigator-backdrop" onClick={() => setNavigatorOpen(false)}>
          <div className="mobile-navigator-sheet" onClick={(event) => event.stopPropagation()}>
            {navigator}
          </div>
        </div>
      ) : null}

      {reviewOpen ? (
        <div className="practice-modal-backdrop">
          <section
            className="practice-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-review-title"
          >
            <button
              type="button"
              className="icon-button modal-close"
              aria-label="Đóng rà soát"
              onClick={() => setReviewOpen(false)}
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
              <button type="button" onClick={() => setReviewOpen(false)}>
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
    </main>
  );
}
