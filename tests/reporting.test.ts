import { describe, expect, it } from "vitest";

import {
  computeAdminSummary,
  computeChapterDifficulty,
  computeQuestionMetrics,
} from "@/src/features/admin/reporting";

describe("administration reporting", () => {
  it("computes distractor selection rates from real answer rows", () => {
    const rows = [
      ...Array.from({ length: 7 }, () => ({
        questionId: "q1",
        questionContent: "Câu hỏi một",
        chapterId: "c1",
        chapterTitle: "Chương 1",
        selectedLabel: "B",
        isCorrect: true,
      })),
      ...Array.from({ length: 2 }, () => ({
        questionId: "q1",
        questionContent: "Câu hỏi một",
        chapterId: "c1",
        chapterTitle: "Chương 1",
        selectedLabel: "C",
        isCorrect: false,
      })),
      {
        questionId: "q1",
        questionContent: "Câu hỏi một",
        chapterId: "c1",
        chapterTitle: "Chương 1",
        selectedLabel: "A",
        isCorrect: false,
      },
    ];

    expect(computeQuestionMetrics(rows)).toEqual([
      {
        questionId: "q1",
        questionContent: "Câu hỏi một",
        chapterId: "c1",
        chapterTitle: "Chương 1",
        attempts: 10,
        correctRate: 70,
        unansweredRate: 0,
        mostSelectedDistractor: "C",
        distractorRates: { A: 10, C: 20 },
      },
    ]);
  });

  it("counts unanswered snapshots without treating them as distractors", () => {
    const metrics = computeQuestionMetrics([
      {
        questionId: "q2",
        questionContent: "Câu hỏi hai",
        chapterId: "c2",
        chapterTitle: "Chương 2",
        selectedLabel: null,
        isCorrect: false,
      },
      {
        questionId: "q2",
        questionContent: "Câu hỏi hai",
        chapterId: "c2",
        chapterTitle: "Chương 2",
        selectedLabel: "D",
        isCorrect: false,
      },
    ])[0]!;

    expect(metrics).toMatchObject({
      attempts: 2,
      correctRate: 0,
      unansweredRate: 50,
      mostSelectedDistractor: "D",
      distractorRates: { D: 50 },
    });
  });

  it("computes active users, attempts, average score, and completion rate", () => {
    expect(
      computeAdminSummary(
        [
          { userId: "u1", status: "submitted", score: 80 },
          { userId: "u1", status: "in_progress", score: null },
          { userId: "u2", status: "submitted", score: 60 },
          { userId: "u3", status: "expired", score: null },
        ],
        12,
      ),
    ).toEqual({
      activeUsers: 3,
      attempts: 4,
      averageScore: 70,
      completionRate: 50,
      totalUsers: 12,
    });
  });

  it("ranks difficult chapters by incorrect rate", () => {
    expect(
      computeChapterDifficulty([
        { chapterId: "c1", chapterTitle: "Chương 1", isCorrect: true },
        { chapterId: "c1", chapterTitle: "Chương 1", isCorrect: false },
        { chapterId: "c2", chapterTitle: "Chương 2", isCorrect: false },
        { chapterId: "c2", chapterTitle: "Chương 2", isCorrect: false },
      ]),
    ).toEqual([
      {
        chapterId: "c2",
        chapterTitle: "Chương 2",
        answers: 2,
        incorrectRate: 100,
      },
      {
        chapterId: "c1",
        chapterTitle: "Chương 1",
        answers: 2,
        incorrectRate: 50,
      },
    ]);
  });
});
