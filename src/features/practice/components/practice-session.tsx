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

function getPassage(content: string) {
  if (content.includes("Hãy đọc thông tin dưới đây và trả lời câu hỏi") || content.includes("(Nguồn:")) {
    const blocks = content.split(/\n\s*\n/);
    if (blocks.length >= 2) {
      return blocks.slice(0, blocks.length - 1).join('\n\n');
    }
  }
  return null;
}

function getQuestionText(content: string) {
  if (content.includes("Hãy đọc thông tin dưới đây và trả lời câu hỏi") || content.includes("(Nguồn:")) {
    const blocks = content.split(/\n\s*\n/);
    if (blocks.length >= 2) {
      return blocks[blocks.length - 1];
    }
  }
  return content;
}

export function PracticeSession({
  initialState,
  saveAnswer,
  saveFlag,
  finish,
}: PracticeSessionProps) {
  const [state, setState] = useState(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`practice_state_${initialState.attemptId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setState((prev) => ({
            ...prev,
            answers: parsed.answers || prev.answers,
            currentQuestionId: parsed.currentQuestionId || prev.currentQuestionId,
          }));
        }
      }
    } catch (e) {
      // Ignore
    }
    setHydrated(true);
  }, [initialState.attemptId]);

  useEffect(() => {
    if (hydrated && state.status === "in_progress") {
      try {
        sessionStorage.setItem(
          `practice_state_${state.attemptId}`,
          JSON.stringify({
            answers: state.answers,
            currentQuestionId: state.currentQuestionId,
          })
        );
      } catch (e) {
        // Ignore
      }
    } else if (hydrated && state.status !== "in_progress") {
      try {
        sessionStorage.removeItem(`practice_state_${state.attemptId}`);
      } catch (e) {}
    }
  }, [hydrated, state.attemptId, state.answers, state.currentQuestionId, state.status]);

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
  
  const visibleQuestions = useMemo(() => {
    if (!currentQuestion) return [];
    const passage = getPassage(currentQuestion.content);
    if (!passage) return [currentQuestion];

    let start = currentIndex;
    while (start > 0) {
      const prevQ = state.questions[start - 1]!;
      if (getPassage(prevQ.content) === passage) {
        start--;
      } else {
        break;
      }
    }

    let end = currentIndex;
    while (end < state.questions.length - 1) {
      const nextQ = state.questions[end + 1]!;
      if (getPassage(nextQ.content) === passage) {
        end++;
      } else {
        break;
      }
    }

    return state.questions.slice(start, end + 1);
  }, [currentQuestion, currentIndex, state.questions]);

  const visiblePassage = getPassage(currentQuestion?.content || "");
  const currentGroupStart = state.questions.findIndex(q => q.id === (visibleQuestions[0]?.id || state.currentQuestionId));
  const currentGroupEnd = state.questions.findIndex(q => q.id === (visibleQuestions[visibleQuestions.length - 1]?.id || state.currentQuestionId));

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
    (questionId: string, optionId: string) => {
      const answer = state.answers[questionId];
      if (answer?.locked || state.status !== "in_progress") return;
      const question = state.questions.find((q) => q.id === questionId);
      if (!question) return;

      setState((current) =>
        answerPracticeQuestion(current, questionId, optionId),
      );
      void persistAnswer(
        questionId,
        question.attemptQuestionId,
        optionId,
      );
    },
    [persistAnswer, state.answers, state.status, state.questions],
  );

  const toggleFlag = useCallback((questionId: string) => {
    if (state.status !== "in_progress") return;
    const flagged = !Boolean(state.answers[questionId]?.flagged);
    setState((current) => togglePracticeFlag(current, questionId));
    setError("");
    const question = state.questions.find((q) => q.id === questionId);
    if (!question) return;
    void saveFlag(
      state.attemptId,
      question.attemptQuestionId,
      flagged,
    ).catch(() => {
      setState((current) => togglePracticeFlag(current, questionId));
      setError("Chưa lưu được cờ câu hỏi. Hãy thử lại.");
    });
  }, [saveFlag, state.answers, state.attemptId, state.status, state.questions]);

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

  useModalFocus({
    active: reviewOpen,
    containerRef: dialogRef,
    initialFocusRef: closeDialogRef,
    invokerRef: reviewInvokerRef,
    onClose: closeReview,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (reviewOpen || state.status !== "in_progress") return;
      if (isEditableTarget(event.target)) return;
      if (/^[1-4]$/.test(event.key)) {
        if (visibleQuestions.length > 1) return; // Disable shortcut for grouped questions
        const option = currentQuestion.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          chooseOption(currentQuestion.id, option.id);
        }
      } else if (event.key.toLowerCase() === "f") {
        if (visibleQuestions.length > 1) return; // Disable shortcut for grouped questions
        event.preventDefault();
        toggleFlag(currentQuestion.id);
      } else if (event.key === "ArrowRight" && currentGroupEnd < state.questions.length - 1) {
        event.preventDefault();
        goToQuestion(currentGroupEnd + 1);
      } else if (event.key === "ArrowLeft" && currentGroupStart > 0) {
        event.preventDefault();
        goToQuestion(currentGroupStart - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    chooseOption,
    currentGroupEnd,
    currentGroupStart,
    currentQuestion,
    goToQuestion,
    reviewOpen,
    state.questions.length,
    state.status,
    toggleFlag,
    visibleQuestions.length,
  ]);

  const navigator = useMemo(
    () => (
      <nav aria-label="Điều hướng câu hỏi">
        <div className="navigator-header">
          <button
            ref={navigatorCloseRef}
            type="button"
            className="icon-button modal-close"
            aria-label="Đóng danh sách"
            onClick={closeNavigator}
          >
            <X size={21} />
          </button>
          <span>Danh sách câu hỏi</span>
        </div>
        <div className="navigator-grid">
          {state.questions.map((q, index) => {
            const id = q.id;
            const qState = state.answers[id];
            const isCurrent = visibleQuestions.some(q => q.id === id);
            let stateClass = "";
            if (qState?.isCorrect === true) {
              stateClass = " is-correct";
            } else if (qState?.isCorrect === false) {
              stateClass = " is-wrong";
            } else if (qState?.optionId) {
              stateClass = " is-answered";
            }
            return (
              <button
                key={id}
                type="button"
                className={`navigator-item${isCurrent ? " is-current" : ""}${stateClass}${qState?.flagged ? " is-flagged" : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Câu ${index + 1}${qState?.flagged ? " đã đặt cờ" : ""}`}
                onClick={() => goToQuestion(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="navigator-legend">
          <span><i className="legend-current" /> Hiện tại</span>
          <span><i className="legend-answered" /> Đã trả lời</span>
          <span><i className="legend-correct" /> Đúng</span>
          <span><i className="legend-wrong" /> Sai</span>
          <span><i className="legend-flagged" /> Đặt cờ</span>
        </div>
      </nav>
    ),
    [
      closeNavigator,
      goToQuestion,
      state.answers,
      state.questions,
      visibleQuestions,
    ],
  );

  const confirmFinish = async () => {
    setFinishing(true);
    setError("");
    try {
      const total = state.questions.length;
      const correctAnswers = Object.values(state.answers).filter(
        (a) => a.isCorrect
      ).length;
      const score =
        total === 0 ? 0 : Math.round((correctAnswers * 100) / total * 100) / 100;
        
      const answersToSave = Object.entries(state.answers)
        .filter(([, answer]) => !!answer.optionId || answer.flagged)
        .map(([questionId, answer]) => {
          const q = state.questions.find((q) => q.id === questionId);
          return {
            attemptQuestionId: q!.attemptQuestionId,
            optionId: answer.optionId || null,
            flagged: !!answer.flagged,
          };
        });

      const result = await finish(state.attemptId, score, answersToSave);
      setScore(result.score);
      setState((current) => ({ ...current, status: result.status }));
      closeReview();
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
          {visibleQuestions.length > 1 && visiblePassage ? (
            <div className="prose mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
              {visiblePassage}
            </div>
          ) : null}

          {visibleQuestions.map((q, vIdx) => {
            const answer = state.answers[q.id];
            const qIndex = state.questions.findIndex(question => question.id === q.id);
            const isGrouped = visibleQuestions.length > 1;
            const questionText = isGrouped ? getQuestionText(q.content) : q.content;

            return (
              <div key={q.id} className={isGrouped ? "mb-12 border-b border-slate-200 pb-8 last:border-0 last:pb-0" : ""}>
                <div className="question-toolbar">
                  <span>Câu {qIndex + 1} / {state.questions.length}</span>
                  <button
                    type="button"
                    className={answer?.flagged ? "flag-button is-active" : "flag-button"}
                    aria-pressed={Boolean(answer?.flagged)}
                    onClick={() => toggleFlag(q.id)}
                  >
                    <Flag
                      size={18}
                      weight={answer?.flagged ? "fill" : "regular"}
                    />
                    {answer?.flagged ? "Đã đặt cờ" : "Đặt cờ"}
                    {!isGrouped && <kbd>F</kbd>}
                  </button>
                </div>

                <h1 id={`practice-question-title-${q.id}`}>{questionText}</h1>
                <fieldset className="option-list">
                  <legend className="visually-hidden">Các phương án trả lời</legend>
                  {q.options.map((option, index) => {
                    const selected = answer?.optionId === option.id;
                    const isActuallyCorrect = answer?.showFeedback && answer?.correctOptionId === option.id;
                    const correctness =
                      (selected && answer?.isCorrect === true) || isActuallyCorrect
                        ? " is-correct"
                        : selected && answer?.isCorrect === false
                          ? " is-incorrect"
                          : "";
                    return (
                      <label
                        key={option.id}
                        className={`practice-option${selected ? " is-selected" : ""}${correctness}${answer?.locked ? " is-disabled" : ""}`}
                      >
                        <input
                          className="native-option-input"
                          type="radio"
                          name={`practice-answer-${q.id}`}
                          value={option.id}
                          aria-label={`Phương án ${option.label}: ${option.content}`}
                          aria-checked={selected}
                          checked={selected}
                          disabled={Boolean(answer?.locked)}
                          onChange={() => chooseOption(q.id, option.id)}
                        />
                        <span className="option-key">{index + 1}</span>
                        <span className="option-label">{option.content}</span>
                        <span className="option-letter">{option.label}</span>
                      </label>
                    );
                  })}
                </fieldset>

                {answer?.showFeedback &&
                typeof answer.isCorrect === "boolean" ? (
                  <section
                    className={answer.isCorrect ? "feedback feedback-correct" : "feedback feedback-incorrect"}
                    aria-live="polite"
                  >
                    {answer.isCorrect ? (
                      <CheckCircle size={23} weight="fill" />
                    ) : (
                      <XCircle size={23} weight="fill" />
                    )}
                    <div>
                      <strong>{answer.isCorrect ? "Chính xác" : "Chưa chính xác"}</strong>
                      <p>{answer.explanation || "Chưa có lời giải cho câu hỏi này."}</p>
                      {!answer.isCorrect && answer.correctOptionId ? (
                        <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                          Đáp án đúng là: {q.options.find(o => o.id === answer.correctOptionId)?.content}
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {error && answer?.optionId && saveStatus === "error" ? (
                  <div className="practice-error" role="alert">
                    <WarningCircle size={20} />
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void persistAnswer(
                          q.id,
                          q.attemptQuestionId,
                          answer.optionId!
                        )
                      }
                    >
                      Thử lại
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!error && saveStatus === "error" ? (
            <div className="practice-error" role="alert">
               <WarningCircle size={20} />
               <span>Chưa lưu được đáp án. Kiểm tra kết nối và thử lại.</span>
            </div>
          ) : null}

          <footer className="question-actions">
            <button
              type="button"
              disabled={currentGroupStart === 0}
              onClick={() => goToQuestion(currentGroupStart - 1)}
            >
              <ArrowLeft size={18} /> Câu trước
            </button>
            {currentGroupEnd < state.questions.length - 1 ? (
              <button
                type="button"
                className="next-button"
                onClick={() => goToQuestion(currentGroupEnd + 1)}
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
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '16px' }}>
            <button
              type="button"
              className="finish-link"
              onClick={openReview}
            >
              Kết thúc
            </button>
            <Link
              href={`/courses/${state.courseSlug}`}
              className="save-link"
              style={{ fontWeight: 500, color: 'var(--text-secondary)' }}
            >
              Lưu & thoát
            </Link>
          </div>
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
            {error ? (
              <div className="practice-error" role="alert" style={{ marginBottom: "1rem", color: "var(--ktct-danger)" }}>
                <span>{error}</span>
              </div>
            ) : null}
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
