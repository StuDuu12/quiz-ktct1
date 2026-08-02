import { describe, expect, it } from "vitest";

import {
  answerPracticeQuestion,
  applyPracticeFeedback,
  togglePracticeFlag,
} from "@/src/features/practice/engine";
import type { PracticeState } from "@/src/features/practice/types";

const state: PracticeState = {
  attemptId: "attempt-1",
  courseSlug: "kinh-te-chinh-tri",
  chapterId: "chapter-1",
  chapterPosition: 1,
  chapterTitle: "Chương 1",
  currentQuestionId: "q1",
  status: "in_progress",
  questions: [
    {
      id: "q1",
      attemptQuestionId: "attempt-question-1",
      content: "Câu hỏi thứ nhất?",
      explanation: "Phương án A mới đúng.",
      correctOptionId: "option-a",
      options: [
        { id: "option-a", label: "A", content: "Phương án A" },
        { id: "option-b", label: "B", content: "Phương án B" },
        { id: "option-c", label: "C", content: "Phương án C" },
        { id: "option-d", label: "D", content: "Phương án D" },
      ],
    },
    {
      id: "q2",
      attemptQuestionId: "attempt-question-2",
      content: "Câu hỏi thứ hai?",
      explanation: "Phương án A là đáp án đúng.",
      correctOptionId: "option-e",
      options: [
        { id: "option-e", label: "A", content: "Phương án A" },
        { id: "option-f", label: "B", content: "Phương án B" },
        { id: "option-g", label: "C", content: "Phương án C" },
        { id: "option-h", label: "D", content: "Phương án D" },
      ],
    },
  ],
  answers: {},
};

describe("practice engine", () => {
  it("locks the first submitted answer and reveals feedback", () => {
    const next = answerPracticeQuestion(state, "q1", "option-b");

    expect(next.answers.q1).toMatchObject({
      optionId: "option-b",
      isCorrect: false,
      correctOptionId: "option-a",
      explanation: "Phương án A mới đúng.",
      locked: true,
      showFeedback: true,
    });
    expect(state.answers.q1).toBeUndefined();
    expect(() =>
      answerPracticeQuestion(next, "q1", "option-c"),
    ).toThrow("ANSWER_LOCKED");
  });

  it("rejects an option that is not part of the question", () => {
    expect(() =>
      answerPracticeQuestion(state, "q1", "option-e"),
    ).toThrow("OPTION_NOT_FOUND");
  });

  it("merges server-owned correctness without changing the locked option", () => {
    const answered = answerPracticeQuestion(state, "q1", "option-b");
    const next = applyPracticeFeedback(answered, "q1", {
      optionId: "option-a",
      isCorrect: false,
      explanation: "Phương án A mới đúng.",
      reconciled: true,
    });

    expect(next.answers.q1).toMatchObject({
      optionId: "option-a",
      isCorrect: false,
      explanation: "Phương án A mới đúng.",
      locked: true,
      showFeedback: true,
    });
  });

  it("toggles a flag without answering the question", () => {
    const flagged = togglePracticeFlag(state, "q2");
    expect(flagged.answers.q2).toEqual({
      flagged: true,
      locked: false,
      showFeedback: false,
    });

    expect(togglePracticeFlag(flagged, "q2").answers.q2?.flagged).toBe(false);
  });
});
