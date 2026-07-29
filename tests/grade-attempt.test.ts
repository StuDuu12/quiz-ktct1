import { describe, expect, it } from "vitest";

import { gradeAttempt } from "@/src/features/history/grade";

const snapshot = [
  { questionId: "q1", correctOptionId: "b" },
  { questionId: "q2", correctOptionId: "c" },
];

describe("gradeAttempt", () => {
  it("grades against the immutable snapshot", () => {
    expect(gradeAttempt(snapshot, { q1: "b", q2: "a" })).toEqual({
      correct: 1,
      incorrect: 1,
      unanswered: 0,
      scorePercent: 50,
    });
  });

  it("counts omitted answers separately", () => {
    expect(gradeAttempt(snapshot, {})).toEqual({
      correct: 0,
      incorrect: 0,
      unanswered: 2,
      scorePercent: 0,
    });
  });

  it("ignores answers for questions outside the immutable snapshot", () => {
    expect(gradeAttempt(snapshot, { unknown: "b" })).toEqual({
      correct: 0,
      incorrect: 0,
      unanswered: 2,
      scorePercent: 0,
    });
  });

  it("returns a zero score for an empty snapshot", () => {
    expect(gradeAttempt([], { q1: "b" })).toEqual({
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      scorePercent: 0,
    });
  });
});
