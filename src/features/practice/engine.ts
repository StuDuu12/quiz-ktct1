import type {
  PracticeAnswer,
  PracticeFeedback,
  PracticeState,
} from "@/src/features/practice/types";

function getQuestion(state: PracticeState, questionId: string) {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) throw new Error("QUESTION_NOT_FOUND");
  return question;
}

function emptyAnswer(): PracticeAnswer {
  return {
    flagged: false,
    locked: false,
    showFeedback: false,
  };
}

export function answerPracticeQuestion(
  state: PracticeState,
  questionId: string,
  optionId: string,
): PracticeState {
  const question = getQuestion(state, questionId);
  const current = state.answers[questionId] ?? emptyAnswer();

  if (current.locked) throw new Error("ANSWER_LOCKED");
  if (!question.options.some((option) => option.id === optionId)) {
    throw new Error("OPTION_NOT_FOUND");
  }
  if (!question.correctOptionId) {
    throw new Error("PRACTICE_FEEDBACK_UNAVAILABLE");
  }

  return {
    ...state,
    answers: {
      ...state.answers,
      [questionId]: {
        ...current,
        optionId,
        isCorrect: optionId === question.correctOptionId,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation,
        locked: true,
        showFeedback: true,
      },
    },
  };
}

export function applyPracticeFeedback(
  state: PracticeState,
  questionId: string,
  feedback: PracticeFeedback,
): PracticeState {
  getQuestion(state, questionId);
  const current = state.answers[questionId];
  if (!current?.locked || !current.optionId) {
    throw new Error("ANSWER_NOT_SUBMITTED");
  }

  return {
    ...state,
    answers: {
      ...state.answers,
      [questionId]: {
        ...current,
        ...feedback,
      },
    },
  };
}

export function togglePracticeFlag(
  state: PracticeState,
  questionId: string,
): PracticeState {
  getQuestion(state, questionId);
  const current = state.answers[questionId] ?? emptyAnswer();

  return {
    ...state,
    answers: {
      ...state.answers,
      [questionId]: {
        ...current,
        flagged: !current.flagged,
      },
    },
  };
}
