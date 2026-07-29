import { describe, expect, it } from "vitest";

import { remainingSeconds } from "@/src/features/exam/timer";

describe("remainingSeconds", () => {
  it("derives the remaining duration from the persisted deadline after reload", () => {
    expect(
      remainingSeconds(
        "2026-07-29T11:00:00.000Z",
        new Date("2026-07-29T10:30:00.000Z"),
      ),
    ).toBe(1800);
  });

  it("clamps an expired exam to zero", () => {
    expect(
      remainingSeconds(
        "2026-07-29T11:00:00.000Z",
        new Date("2026-07-29T11:01:00.000Z"),
      ),
    ).toBe(0);
  });

  it("keeps a partial final second available", () => {
    expect(
      remainingSeconds(
        "2026-07-29T11:00:00.000Z",
        new Date("2026-07-29T10:59:59.001Z"),
      ),
    ).toBe(1);
  });

  it("rejects an invalid persisted deadline", () => {
    expect(() => remainingSeconds("not-a-date", new Date())).toThrow(
      "EXAM_DEADLINE_INVALID",
    );
  });
});
