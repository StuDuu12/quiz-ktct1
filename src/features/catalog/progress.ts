export type ProgressAttempt = {
  chapterId: string;
  status: "submitted" | "in_progress" | "expired";
  correct: number;
  total: number;
};

export type ChapterProgress = {
  attempts: number;
  accuracy: number | null;
};

/** Returns the aggregate result of completed practice work for a chapter. */
export function calculateChapterProgress(
  attempts: readonly ProgressAttempt[],
  chapterId: string,
): ChapterProgress {
  const completed = attempts.filter(
    (attempt) =>
      attempt.chapterId === chapterId && attempt.status === "submitted" && attempt.total > 0,
  );

  if (completed.length === 0) return { attempts: 0, accuracy: null };

  const total = completed.reduce((sum, attempt) => sum + attempt.total, 0);
  const correct = completed.reduce((sum, attempt) => sum + attempt.correct, 0);

  return { attempts: completed.length, accuracy: Math.round((correct / total) * 100) };
}
