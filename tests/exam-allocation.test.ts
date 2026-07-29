import { describe, expect, it } from "vitest";

import { allocateExamQuestions } from "@/src/features/exam/allocate";
import { seededShuffle } from "@/src/features/exam/shuffle";
import type { ExamQuestion } from "@/src/features/exam/types";

const chapterIds = [
  "chapter-1",
  "chapter-2",
  "chapter-3",
  "chapter-4",
  "chapter-5",
  "chapter-6",
];

function makePool(counts: number[]): ExamQuestion[] {
  return counts.flatMap((count, chapterIndex) =>
    Array.from({ length: count }, (_, questionIndex) => ({
      id: `question-${chapterIndex + 1}-${questionIndex + 1}`,
      chapterId: chapterIds[chapterIndex]!,
    })),
  );
}

function countByChapter(questions: ExamQuestion[]) {
  return Object.fromEntries(
    chapterIds.map((chapterId) => [
      chapterId,
      questions.filter((question) => question.chapterId === chapterId).length,
    ]),
  );
}

describe("seededShuffle", () => {
  it("returns the same non-mutating permutation for the same seed", () => {
    const source = ["a", "b", "c", "d", "e", "f"];

    const first = seededShuffle(source, "seed-1");
    const second = seededShuffle(source, "seed-1");

    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
    expect(source).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("allocateExamQuestions", () => {
  it("allocates exactly 40 questions with a difference of at most one across six supplied chapters", () => {
    const selected = allocateExamQuestions(
      makePool([10, 10, 10, 10, 10, 10]),
      chapterIds,
      40,
      "seed-1",
    );

    expect(selected).toHaveLength(40);
    const counts = Object.values(countByChapter(selected));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for the same pool, chapter order, total, and seed", () => {
    const pool = makePool([10, 10, 10, 10, 10, 10]);

    expect(allocateExamQuestions(pool, chapterIds, 40, "seed-2")).toEqual(
      allocateExamQuestions(pool, chapterIds, 40, "seed-2"),
    );
  });

  it("backfills a short chapter deterministically without duplicate questions", () => {
    const pool = makePool([2, 10, 10, 10, 10, 10]);

    const selected = allocateExamQuestions(pool, chapterIds, 40, "seed-3");

    expect(selected).toHaveLength(40);
    expect(new Set(selected.map((question) => question.id))).toHaveLength(40);
    expect(countByChapter(selected)["chapter-1"]).toBe(2);
    expect(selected).toEqual(
      allocateExamQuestions(pool, chapterIds, 40, "seed-3"),
    );
  });

  it("rejects a bank with fewer than the requested 40 unique eligible questions", () => {
    const duplicate = {
      id: "duplicate-question",
      chapterId: "chapter-6",
    };
    const pool = [...makePool([7, 7, 7, 6, 6, 5]), duplicate, duplicate];

    expect(() =>
      allocateExamQuestions(pool, chapterIds, 40, "seed-4"),
    ).toThrow("Not enough eligible questions");
  });
});
