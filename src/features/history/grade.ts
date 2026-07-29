export type GradeQuestionSnapshot = {
  questionId: string;
  correctOptionId: string;
};

export type GradeResult = {
  correct: number;
  incorrect: number;
  unanswered: number;
  scorePercent: number;
};

export function gradeAttempt(
  snapshot: readonly GradeQuestionSnapshot[],
  answers: Readonly<Record<string, string | null | undefined>>,
): GradeResult {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;

  for (const question of snapshot) {
    const selectedOptionId = answers[question.questionId];
    if (!selectedOptionId) {
      unanswered += 1;
    } else if (selectedOptionId === question.correctOptionId) {
      correct += 1;
    } else {
      incorrect += 1;
    }
  }

  return {
    correct,
    incorrect,
    unanswered,
    scorePercent:
      snapshot.length === 0
        ? 0
        : Math.round((correct * 10_000) / snapshot.length) / 100,
  };
}
