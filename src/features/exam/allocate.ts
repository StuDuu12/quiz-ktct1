import {
  rankBySeed,
  seededShuffle,
} from "@/src/features/exam/shuffle";
import type { ExamQuestion } from "@/src/features/exam/types";

export function allocateExamQuestions<T extends ExamQuestion>(
  pool: readonly T[],
  chapterIds: readonly string[],
  total: number,
  seed: string,
): T[] {
  const uniqueChapterIds = [...new Set(chapterIds)];
  if (
    uniqueChapterIds.length === 0 ||
    uniqueChapterIds.length !== chapterIds.length ||
    !Number.isInteger(total) ||
    total <= 0
  ) {
    throw new Error("Invalid exam allocation");
  }

  const eligibleById = new Map(
    pool
      .filter((question) => uniqueChapterIds.includes(question.chapterId))
      .map((question) => [question.id, question]),
  );
  const eligible = [...eligibleById.values()];
  if (eligible.length < total) {
    throw new Error("Not enough eligible questions");
  }

  const shuffledChapters = seededShuffle(uniqueChapterIds, `${seed}:chapters`);
  const base = Math.floor(total / uniqueChapterIds.length);
  const remainder = total % uniqueChapterIds.length;
  const quotaByChapter = new Map(
    shuffledChapters.map((chapterId, index) => [
      chapterId,
      base + (index < remainder ? 1 : 0),
    ]),
  );

  const selected: T[] = [];
  const selectedIds = new Set<string>();

  for (const chapterId of uniqueChapterIds) {
    const chapterPool = rankBySeed(
      eligible.filter((question) => question.chapterId === chapterId),
      `${seed}:chapter:${chapterId}`,
      (question) => question.id,
    );
    const quota = quotaByChapter.get(chapterId)!;
    for (const question of chapterPool.slice(0, quota)) {
      selected.push(question);
      selectedIds.add(question.id);
    }
  }

  const shortfall = total - selected.length;
  if (shortfall > 0) {
    const backfill = rankBySeed(
      eligible.filter((question) => !selectedIds.has(question.id)),
      `${seed}:backfill`,
      (question) => question.id,
    ).slice(0, shortfall);
    selected.push(...backfill);
  }

  return rankBySeed(selected, `${seed}:questions`, (question) => question.id);
}
