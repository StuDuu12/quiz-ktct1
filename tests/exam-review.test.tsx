// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { describe, expect, it } from "vitest";

import { buildReviewSummary } from "@/src/features/exam/review";
import type {
  ExamAnswer,
  ExamQuestionSnapshot,
} from "@/src/features/exam/types";

const snapshot: ExamQuestionSnapshot[] = [
  {
    id: "q1",
    attemptQuestionId: "aq1",
    content: "Giá trị của hàng hóa do yếu tố nào quyết định?",
    difficulty: 2,
    options: [
      { id: "q1-a", label: "A", content: "Lao động cụ thể" },
      {
        id: "q1-b",
        label: "B",
        content: "Lao động xã hội cần thiết",
      },
    ],
  },
  {
    id: "q2",
    attemptQuestionId: "aq2",
    content: "Tiền tệ có chức năng nào?",
    difficulty: 2,
    options: [
      { id: "q2-a", label: "A", content: "Thước đo giá trị" },
      { id: "q2-b", label: "B", content: "Tạo ra giá trị" },
    ],
  },
  {
    id: "q3",
    attemptQuestionId: "aq3",
    content: "Tư bản bất biến ký hiệu là gì?",
    difficulty: 2,
    options: [
      { id: "q3-a", label: "A", content: "v" },
      { id: "q3-b", label: "B", content: "c" },
    ],
  },
];

describe("buildReviewSummary", () => {
  it("lists the selected answer for every question, including unanswered ones", () => {
    const answers: Record<string, ExamAnswer> = {
      q1: { optionId: "q1-b", flagged: true },
      q3: { optionId: "q3-b", flagged: false },
    };

    expect(buildReviewSummary(snapshot, answers)).toEqual({
      answeredCount: 2,
      unansweredCount: 1,
      flaggedCount: 1,
      questions: [
        {
          questionId: "q1",
          questionNumber: 1,
          content: "Giá trị của hàng hóa do yếu tố nào quyết định?",
          selectedOption: {
            id: "q1-b",
            label: "B",
            content: "Lao động xã hội cần thiết",
          },
          flagged: true,
        },
        {
          questionId: "q2",
          questionNumber: 2,
          content: "Tiền tệ có chức năng nào?",
          selectedOption: null,
          flagged: false,
        },
        {
          questionId: "q3",
          questionNumber: 3,
          content: "Tư bản bất biến ký hiệu là gì?",
          selectedOption: {
            id: "q3-b",
            label: "B",
            content: "c",
          },
          flagged: false,
        },
      ],
    });
  });

  it("never includes correctness or explanations in the pre-submit review", () => {
    const summary = buildReviewSummary(snapshot, {
      q1: { optionId: "q1-a", flagged: false },
    });

    expect(JSON.stringify(summary)).not.toMatch(
      /isCorrect|correctOption|explanation/i,
    );
  });

  it("rejects an answer option outside its immutable question snapshot", () => {
    expect(() =>
      buildReviewSummary(snapshot, {
        q1: { optionId: "q2-a", flagged: false },
      }),
    ).toThrow("EXAM_ANSWER_SNAPSHOT_MISMATCH");
  });
});
