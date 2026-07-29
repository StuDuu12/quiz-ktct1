import { Flag } from "@phosphor-icons/react";
import type { Ref } from "react";

import type {
  ExamAnswer,
  ExamQuestionSnapshot,
} from "@/src/features/exam/types";

type QuestionNavigatorProps = {
  questions: ExamQuestionSnapshot[];
  answers: Record<string, ExamAnswer>;
  currentQuestionId: string;
  onSelect: (index: number) => void;
  onClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
};

export function QuestionNavigator({
  questions,
  answers,
  currentQuestionId,
  onSelect,
  onClose,
  closeButtonRef,
}: QuestionNavigatorProps) {
  const answeredCount = questions.filter(
    (question) => answers[question.id]?.optionId,
  ).length;

  return (
    <nav
      className="exam-question-navigator"
      aria-label={`Danh sách ${questions.length} câu hỏi`}
    >
      <div className="exam-navigator-heading">
        <div>
          <span>Tiến độ bài thi</span>
          <strong>
            {answeredCount}/{questions.length} câu
          </strong>
        </div>
        {onClose ? (
          <button
            ref={closeButtonRef}
            type="button"
            className="exam-navigator-close"
            aria-label="Đóng danh sách câu hỏi"
            onClick={onClose}
          >
            Đóng
          </button>
        ) : null}
      </div>
      <div className="exam-navigator-grid">
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const current = question.id === currentQuestionId;
          const answered = Boolean(answer?.optionId);
          const flagged = Boolean(answer?.flagged);
          return (
            <button
              key={question.id}
              type="button"
              className={[
                "exam-navigator-item",
                current ? "is-current" : "",
                answered ? "is-answered" : "is-unanswered",
                flagged ? "is-flagged" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={current ? "step" : undefined}
              aria-label={[
                `Câu ${index + 1}`,
                current ? "hiện tại" : "không phải câu hiện tại",
                answered ? "đã trả lời" : "chưa trả lời",
                flagged ? "đặt cờ" : "không đặt cờ",
              ].join(", ")}
              onClick={() => onSelect(index)}
            >
              <span>{index + 1}</span>
              {flagged ? (
                <Flag size={11} weight="fill" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="exam-navigator-legend" aria-label="Chú thích trạng thái">
        <span>
          <i className="legend-current" /> Hiện tại
        </span>
        <span>
          <i className="legend-answered" /> Đã trả lời
        </span>
        <span>
          <i className="legend-unanswered" /> Chưa trả lời
        </span>
        <span>
          <i className="legend-flagged" /> Đặt cờ
        </span>
      </div>
    </nav>
  );
}
