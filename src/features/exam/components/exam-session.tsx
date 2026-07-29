"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  Flag,
  ListNumbers,
  WarningCircle,
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

import { QuestionNavigator } from "@/src/features/exam/components/question-navigator";
import { ReviewDialog } from "@/src/features/exam/components/review-dialog";
import { useModalFocus } from "@/src/features/exam/components/use-modal-focus";
import { buildReviewSummary } from "@/src/features/exam/review";
import { remainingSeconds } from "@/src/features/exam/timer";
import type {
  ExamSessionState,
  LoadExamReview,
  SaveExamAnswer,
  SubmitExam,
  ToggleExamFlag,
} from "@/src/features/exam/types";

type ExamSessionProps = {
  initialState: ExamSessionState;
  saveAnswer: SaveExamAnswer;
  saveFlag: ToggleExamFlag;
  loadReview: LoadExamReview;
  submit: SubmitExam;
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

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ExamSession({
  initialState,
  saveAnswer,
  saveFlag,
  loadReview,
  submit,
}: ExamSessionProps) {
  const [state, setState] = useState(initialState);
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(initialState.expiresAt, new Date(initialState.serverNow)),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRevision, setReviewRevision] = useState<number | null>(null);
  const [reviewNotice, setReviewNotice] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<{
    questionId: string;
    attemptQuestionId: string;
    optionId: string;
  } | null>(null);
  const reviewInvokerRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavigatorInvokerRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavigatorDialogRef = useRef<HTMLElement | null>(null);
  const mobileNavigatorCloseRef = useRef<HTMLButtonElement | null>(null);
  const saveSequenceRef = useRef(new Map<string, number>());
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const clientWallStartedAtRef = useRef(0);
  const serverStartedAtMsRef = useRef(Date.parse(initialState.serverNow));
  const autoSubmitStartedRef = useRef(false);

  const currentIndex = state.questions.findIndex(
    (question) => question.id === state.currentQuestionId,
  );
  const currentQuestion = state.questions[currentIndex]!;
  const currentAnswer = state.answers[currentQuestion.id];
  const summary = useMemo(
    () => buildReviewSummary(state.questions, state.answers),
    [state.answers, state.questions],
  );

  const goToQuestion = useCallback((index: number) => {
    setState((current) => {
      const question = current.questions[index];
      return question
        ? { ...current, currentQuestionId: question.id }
        : current;
    });
    setNavigatorOpen(false);
  }, []);
  const closeReview = useCallback(() => {
    setReviewOpen(false);
    setReviewNotice("");
  }, []);
  const closeMobileNavigator = useCallback(
    () => setNavigatorOpen(false),
    [],
  );

  useModalFocus({
    active: navigatorOpen,
    containerRef: mobileNavigatorDialogRef,
    initialFocusRef: mobileNavigatorCloseRef,
    invokerRef: mobileNavigatorInvokerRef,
    onClose: closeMobileNavigator,
  });

  const enqueueMutation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const run = mutationQueueRef.current
        .catch(() => undefined)
        .then(operation);
      mutationQueueRef.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  const applyAuthoritativeReview = useCallback(
    (review: Awaited<ReturnType<LoadExamReview>>) => {
      setState((current) => ({
        ...current,
        answers: Object.fromEntries(
          current.questions.map((question) => [
            question.id,
            review.answers[question.attemptQuestionId] ?? {
              flagged: false,
            },
          ]),
        ),
      }));
      setReviewRevision(review.revision);
    },
    [],
  );

  const refreshReview = useCallback(async () => {
    const review = await loadReview(state.attemptId);
    applyAuthoritativeReview(review);
    return review;
  }, [applyAuthoritativeReview, loadReview, state.attemptId]);

  const performSubmit = useCallback(async (mode: "manual" | "auto") => {
    if (submitting || state.status !== "in_progress") return;
    if (mode === "manual" && reviewRevision === null) return;
    setSubmitting(true);
    setError("");
    try {
      const result =
        mode === "manual"
          ? await submit(state.attemptId, reviewRevision!)
          : await submit(state.attemptId);
      setState((current) => ({
        ...current,
        status: result.status,
        score: result.score,
        submittedAt: result.submittedAt,
        durationSeconds: result.durationSeconds,
      }));
      setReviewOpen(false);
    } catch (caught) {
      if (
        mode === "manual" &&
        caught instanceof Error &&
        caught.message === "REVIEW_STALE"
      ) {
        try {
          await refreshReview();
          setReviewNotice(
            "Bài làm đã thay đổi ở một tab khác. Danh sách dưới đây đã được cập nhật; vui lòng rà soát và xác nhận lại.",
          );
          setReviewOpen(true);
        } catch {
          setReviewOpen(false);
          setError(
            "Chưa thể tải lại bản rà soát mới nhất. Hãy kiểm tra kết nối và mở rà soát lại.",
          );
        }
      } else {
        setError(
          "Chưa thể nộp bài. Các đáp án đã lưu vẫn an toàn; hãy kiểm tra kết nối và thử lại.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    refreshReview,
    reviewRevision,
    state.attemptId,
    state.status,
    submit,
    submitting,
  ]);

  useEffect(() => {
    clientWallStartedAtRef.current = Date.now();
  }, []);

  const recomputeRemaining = useCallback(() => {
    const elapsedMs = Math.max(
      0,
      Date.now() - clientWallStartedAtRef.current,
    );
    const serverNow = new Date(serverStartedAtMsRef.current + elapsedMs);
    const computed = remainingSeconds(state.expiresAt, serverNow);
    setRemaining((current) => Math.min(current, computed));
  }, [state.expiresAt]);

  useEffect(() => {
    if (state.status !== "in_progress" || remaining <= 0) return;
    recomputeRemaining();
    const interval = window.setInterval(recomputeRemaining, 1000);
    const onVisibilityChange = () => recomputeRemaining();
    const onFocus = () => recomputeRemaining();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [recomputeRemaining, remaining, state.status]);

  useEffect(() => {
    if (
      remaining !== 0 ||
      state.status !== "in_progress" ||
      autoSubmitStartedRef.current
    ) {
      return;
    }
    autoSubmitStartedRef.current = true;
    void performSubmit("auto");
  }, [performSubmit, remaining, state.status]);

  const persistAnswer = useCallback(
    async (
      questionId: string,
      attemptQuestionId: string,
      optionId: string,
    ) => {
      const sequence = (saveSequenceRef.current.get(questionId) ?? 0) + 1;
      saveSequenceRef.current.set(questionId, sequence);
      setPendingAnswer({
        questionId,
        attemptQuestionId,
        optionId,
      });
      setSaveStatus("saving");
      setError("");
      try {
        const saved = await enqueueMutation(() =>
          saveAnswer(
            state.attemptId,
            attemptQuestionId,
            optionId,
          ),
        );
        if (saveSequenceRef.current.get(questionId) !== sequence) return;
        setState((current) => ({
          ...current,
          answers: {
            ...current.answers,
            [questionId]: {
              optionId: saved.optionId,
              flagged: saved.flagged,
            },
          },
        }));
        setPendingAnswer(null);
        setSaveStatus("saved");
      } catch {
        if (saveSequenceRef.current.get(questionId) !== sequence) return;
        setSaveStatus("error");
        setError(
          "Lựa chọn này chưa được lưu. Hãy giữ trang mở và thử lưu lại khi có kết nối.",
        );
      }
    },
    [enqueueMutation, saveAnswer, state.attemptId],
  );

  const chooseOption = useCallback(
    (optionId: string) => {
      if (state.status !== "in_progress" || remaining === 0) return;
      setState((current) => ({
        ...current,
        answers: {
          ...current.answers,
          [currentQuestion.id]: {
            optionId,
            flagged: Boolean(current.answers[currentQuestion.id]?.flagged),
          },
        },
      }));
      void persistAnswer(
        currentQuestion.id,
        currentQuestion.attemptQuestionId,
        optionId,
      );
    },
    [currentQuestion, persistAnswer, remaining, state.status],
  );

  const toggleCurrentFlag = useCallback(() => {
    if (state.status !== "in_progress" || remaining === 0) return;
    const wasFlagged = Boolean(state.answers[currentQuestion.id]?.flagged);
    const nextFlagged = !wasFlagged;
    setState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [currentQuestion.id]: {
          ...current.answers[currentQuestion.id],
          flagged: nextFlagged,
        },
      },
    }));
    setError("");
    void enqueueMutation(() =>
      saveFlag(
        state.attemptId,
        currentQuestion.attemptQuestionId,
        nextFlagged,
      ),
    ).catch(() => {
      setState((current) => ({
        ...current,
        answers: {
          ...current.answers,
          [currentQuestion.id]: {
            ...current.answers[currentQuestion.id],
            flagged: wasFlagged,
          },
        },
      }));
      setError(
        "Cờ câu hỏi chưa được lưu. Hãy kiểm tra kết nối và đặt lại cờ.",
      );
    });
  }, [
    currentQuestion,
    enqueueMutation,
    remaining,
    saveFlag,
    state.answers,
    state.attemptId,
    state.status,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        reviewOpen ||
        navigatorOpen ||
        state.status !== "in_progress" ||
        remaining === 0 ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (/^[1-4]$/.test(event.key)) {
        const option = currentQuestion.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          chooseOption(option.id);
        }
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleCurrentFlag();
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < state.questions.length - 1
      ) {
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
    navigatorOpen,
    remaining,
    reviewOpen,
    state.questions.length,
    state.status,
    toggleCurrentFlag,
  ]);

  if (state.status === "submitted") {
    const score = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
    }).format(state.score ?? 0);
    return (
      <main className="exam-complete">
        <section aria-labelledby="exam-complete-title">
          <CheckCircle size={56} weight="duotone" />
          <p className="exam-kicker">ĐÃ GHI NHẬN</p>
          <h1 id="exam-complete-title">Bài thi đã được nộp</h1>
          <p>
            Điểm của bạn: <strong>{score}%</strong>. Kết quả đã được lưu trên
            máy chủ.
          </p>
          <div className="completion-actions">
            <Link href={`/results/${state.attemptId}`}>
              Xem chi tiết kết quả
            </Link>
            <Link href="/dashboard">Trở về tổng quan</Link>
          </div>
        </section>
      </main>
    );
  }

  const openReview = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    reviewInvokerRef.current = event.currentTarget;
    setReviewLoading(true);
    setReviewNotice("");
    setError("");
    try {
      await mutationQueueRef.current;
      await refreshReview();
      setReviewOpen(true);
    } catch {
      setError(
        "Chưa thể tải bản rà soát đã lưu. Hãy kiểm tra kết nối và thử lại.",
      );
    } finally {
      setReviewLoading(false);
    }
  };

  const navigator = (
    <QuestionNavigator
      questions={state.questions}
      answers={state.answers}
      currentQuestionId={state.currentQuestionId}
      onSelect={goToQuestion}
    />
  );

  return (
    <>
      <main
        className="exam-shell"
        inert={reviewOpen || navigatorOpen ? true : undefined}
      >
        <header className="exam-header">
          <Link
            href={`/courses/${state.courseSlug}`}
            className="exam-brand"
            aria-label="Trở về học phần"
          >
            <BookOpen size={23} weight="fill" />
            <span>Ôn thi KTCT</span>
          </Link>
          <div className="exam-course">
            <span>THI THỬ TỔNG HỢP</span>
            <strong>{state.courseTitle}</strong>
          </div>
          <div
            className={[
              "exam-timer",
              remaining <= 300
                ? "is-critical"
                : remaining <= 600
                  ? "is-warning"
                  : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
            aria-label={`Thời gian còn lại ${formatTimer(remaining)}`}
          >
            <Clock size={19} />
            <span>{formatTimer(remaining)}</span>
          </div>
        </header>

        <div className="exam-save-row">
          <span className={`exam-save-status is-${saveStatus}`} aria-live="polite">
            {saveStatus === "saving"
              ? "Đang lưu…"
              : saveStatus === "saved"
                ? "Đã lưu"
                : saveStatus === "error"
                  ? "Chưa lưu"
                  : "Tự động lưu"}
          </span>
          <button
            ref={reviewInvokerRef}
            type="button"
            className="exam-review-trigger"
            disabled={reviewLoading}
            onClick={(event) => void openReview(event)}
          >
            {reviewLoading ? "Đang tải rà soát…" : "Rà soát và nộp bài"}
          </button>
        </div>

        <div className="exam-layout">
          <section
            className="exam-question-card"
            aria-labelledby="exam-question-title"
          >
            <div className="exam-question-toolbar">
              <span>
                Câu {currentIndex + 1} / {state.questions.length}
              </span>
              <button
                type="button"
                className={currentAnswer?.flagged ? "is-active" : ""}
                aria-pressed={Boolean(currentAnswer?.flagged)}
                onClick={toggleCurrentFlag}
              >
                <Flag
                  size={18}
                  weight={currentAnswer?.flagged ? "fill" : "regular"}
                />
                {currentAnswer?.flagged ? "Đã đặt cờ" : "Đặt cờ"}
                <kbd>F</kbd>
              </button>
            </div>

            <h1 id="exam-question-title">{currentQuestion.content}</h1>
            <div
              className="exam-option-list"
              role="radiogroup"
              aria-label="Các phương án trả lời"
            >
              {currentQuestion.options.map((option, index) => {
                const selected = currentAnswer?.optionId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "exam-option is-selected" : "exam-option"}
                    onClick={() => chooseOption(option.id)}
                  >
                    <span className="exam-option-key">{index + 1}</span>
                    <span className="exam-option-content">{option.content}</span>
                    <span className="exam-option-label">{option.label}</span>
                  </button>
                );
              })}
            </div>

            {error ? (
              <div
                className="exam-error"
                role="alert"
                aria-label="Lỗi lưu bài thi"
              >
                <WarningCircle size={20} />
                <span>{error}</span>
                {remaining === 0 ? (
                  <button
                    type="button"
                    onClick={() => void performSubmit("auto")}
                  >
                    Thử nộp lại
                  </button>
                ) : pendingAnswer ? (
                  <button
                    type="button"
                    onClick={() => {
                      void persistAnswer(
                        pendingAnswer.questionId,
                        pendingAnswer.attemptQuestionId,
                        pendingAnswer.optionId,
                      );
                    }}
                  >
                    Thử lưu lại
                  </button>
                ) : null}
              </div>
            ) : null}

            <footer className="exam-question-actions">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => goToQuestion(currentIndex - 1)}
              >
                <ArrowLeft size={18} /> Câu trước
              </button>
              <button
                type="button"
                disabled={currentIndex === state.questions.length - 1}
                onClick={() => goToQuestion(currentIndex + 1)}
              >
                Câu tiếp <ArrowRight size={18} />
              </button>
            </footer>
          </section>

          <aside className="exam-navigator-panel">{navigator}</aside>
        </div>

        <button
          ref={mobileNavigatorInvokerRef}
          type="button"
          className="exam-mobile-navigator-trigger"
          aria-expanded={navigatorOpen}
          onClick={() => setNavigatorOpen(true)}
        >
          <ListNumbers size={20} />
          Danh sách câu
          <strong>
            {summary.answeredCount}/{state.questions.length}
          </strong>
        </button>

      </main>

      {navigatorOpen ? (
        <div
          className="exam-mobile-navigator-backdrop"
          role="presentation"
          onClick={closeMobileNavigator}
        >
          <section
            ref={mobileNavigatorDialogRef}
            className="exam-mobile-navigator-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Danh sách câu hỏi trên thiết bị di động"
            onClick={(event) => event.stopPropagation()}
          >
            <QuestionNavigator
              questions={state.questions}
              answers={state.answers}
              currentQuestionId={state.currentQuestionId}
              onSelect={goToQuestion}
              onClose={closeMobileNavigator}
              closeButtonRef={mobileNavigatorCloseRef}
            />
          </section>
        </div>
      ) : null}

      {reviewOpen ? (
        <ReviewDialog
          summary={summary}
          invokerRef={reviewInvokerRef}
          submitting={submitting}
          notice={reviewNotice}
          onClose={closeReview}
          onConfirm={() => void performSubmit("manual")}
          onInspect={(index) => {
            goToQuestion(index);
            setReviewOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
