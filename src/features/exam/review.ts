import type {
  ExamAnswer,
  ExamOptionSnapshot,
  ExamQuestionSnapshot,
} from "@/src/features/exam/types";

export type ReviewQuestion = {
  questionId: string;
  questionNumber: number;
  content: string;
  selectedOption: ExamOptionSnapshot | null;
  flagged: boolean;
};

export type ReviewSummary = {
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  questions: ReviewQuestion[];
};

export function buildReviewSummary(
  snapshot: ExamQuestionSnapshot[],
  answers: Record<string, ExamAnswer>,
): ReviewSummary {
  let answeredCount = 0;
  let flaggedCount = 0;
  const questions = snapshot.map((question, index) => {
    const answer = answers[question.id];
    const selectedOption = answer?.optionId
      ? question.options.find((option) => option.id === answer.optionId)
      : null;
    if (answer?.optionId && !selectedOption) {
      throw new Error("EXAM_ANSWER_SNAPSHOT_MISMATCH");
    }
    if (selectedOption) answeredCount += 1;
    if (answer?.flagged) flaggedCount += 1;
    return {
      questionId: question.id,
      questionNumber: index + 1,
      content: question.content,
      selectedOption: selectedOption ?? null,
      flagged: Boolean(answer?.flagged),
    };
  });

  return {
    answeredCount,
    unansweredCount: snapshot.length - answeredCount,
    flaggedCount,
    questions,
  };
}
