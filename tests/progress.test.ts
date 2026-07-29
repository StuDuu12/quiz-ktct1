import { describe, expect, it } from "vitest";

import { calculateChapterProgress } from "@/src/features/catalog/progress";

describe("calculateChapterProgress", () => {
  it("uses submitted practice attempts only", () => {
    expect(
      calculateChapterProgress(
        [
          {
            chapterId: "c1",
            status: "submitted",
            correct: 8,
            total: 10,
          },
          {
            chapterId: "c1",
            status: "in_progress",
            correct: 10,
            total: 10,
          },
        ],
        "c1",
      ),
    ).toEqual({ attempts: 1, accuracy: 80 });
  });
});
