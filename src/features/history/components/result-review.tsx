import {
  CheckCircle,
  Flag,
  MinusCircle,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";

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

export function ResultReview({ result }: { result: AttemptResult }) {
  const correct = result.questions.filter((question) => question.isCorrect)
    .length;
  const unanswered = result.questions.filter(
    (question) => question.isUnanswered,
  ).length;
  const incorrect = result.questions.length - correct - unanswered;

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

      <ol className="result-questions" aria-label="Chi tiết từng câu">
        {result.questions.map((question) => {
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
              <article aria-labelledby={`result-question-${question.position}`}>
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
