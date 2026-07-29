export type ReportAnswerRow = {
  questionId: string;
  questionContent: string;
  chapterId: string;
  chapterTitle: string;
  selectedLabel: string | null;
  isCorrect: boolean;
};

export type QuestionMetric = {
  questionId: string;
  questionContent: string;
  chapterId: string;
  chapterTitle: string;
  attempts: number;
  correctRate: number;
  unansweredRate: number;
  mostSelectedDistractor: string | null;
  distractorRates: Record<string, number>;
};

export type ReportAttemptRow = {
  userId: string;
  status: "in_progress" | "submitted" | "expired";
  score: number | null;
};

export type AdminSummary = {
  activeUsers: number;
  attempts: number;
  averageScore: number | null;
  completionRate: number;
  totalUsers: number;
};

export type ChapterAnswerRow = {
  chapterId: string;
  chapterTitle: string;
  isCorrect: boolean;
};

export type ChapterDifficulty = {
  chapterId: string;
  chapterTitle: string;
  answers: number;
  incorrectRate: number;
};

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function computeQuestionMetrics(
  rows: ReportAnswerRow[],
): QuestionMetric[] {
  const grouped = new Map<string, ReportAnswerRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.questionId) ?? [];
    group.push(row);
    grouped.set(row.questionId, group);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0]!;
    const distractors = new Map<string, number>();
    for (const row of group) {
      if (!row.isCorrect && row.selectedLabel) {
        distractors.set(
          row.selectedLabel,
          (distractors.get(row.selectedLabel) ?? 0) + 1,
        );
      }
    }
    const orderedDistractors = [...distractors.entries()].sort(
      ([leftLabel, leftCount], [rightLabel, rightCount]) =>
        rightCount - leftCount || leftLabel.localeCompare(rightLabel),
    );

    return {
      questionId: first.questionId,
      questionContent: first.questionContent,
      chapterId: first.chapterId,
      chapterTitle: first.chapterTitle,
      attempts: group.length,
      correctRate: percent(
        group.filter((row) => row.isCorrect).length,
        group.length,
      ),
      unansweredRate: percent(
        group.filter((row) => row.selectedLabel === null).length,
        group.length,
      ),
      mostSelectedDistractor: orderedDistractors[0]?.[0] ?? null,
      distractorRates: Object.fromEntries(
        orderedDistractors
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([label, count]) => [label, percent(count, group.length)]),
      ),
    };
  });
}

export function computeAdminSummary(
  rows: ReportAttemptRow[],
  totalUsers: number,
): AdminSummary {
  const submitted = rows.filter((row) => row.status === "submitted");
  const scores = submitted.flatMap((row) =>
    row.score === null ? [] : [row.score],
  );
  return {
    activeUsers: new Set(rows.map((row) => row.userId)).size,
    attempts: rows.length,
    averageScore: scores.length
      ? Math.round(
          scores.reduce((sum, score) => sum + score, 0) / scores.length,
        )
      : null,
    completionRate: percent(submitted.length, rows.length),
    totalUsers,
  };
}

export function computeChapterDifficulty(
  rows: ChapterAnswerRow[],
): ChapterDifficulty[] {
  const grouped = new Map<string, ChapterAnswerRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.chapterId) ?? [];
    group.push(row);
    grouped.set(row.chapterId, group);
  }

  return [...grouped.values()]
    .map((group) => ({
      chapterId: group[0]!.chapterId,
      chapterTitle: group[0]!.chapterTitle,
      answers: group.length,
      incorrectRate: percent(
        group.filter((row) => !row.isCorrect).length,
        group.length,
      ),
    }))
    .sort(
      (left, right) =>
        right.incorrectRate - left.incorrectRate ||
        left.chapterTitle.localeCompare(right.chapterTitle),
    );
}
