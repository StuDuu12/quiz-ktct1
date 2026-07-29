import { describe, expect, it } from "vitest";

import { parseHistoryFilters } from "@/src/features/history/queries";

describe("parseHistoryFilters", () => {
  it("normalizes supported filters and pagination", () => {
    expect(
      parseHistoryFilters({
        kind: "practice",
        chapter: "20000000-0000-0000-0000-000000000001",
        from: "2026-07-01",
        to: "2026-07-29",
        score: "80-100",
        page: "3",
      }),
    ).toEqual({
      kind: "practice",
      chapterId: "20000000-0000-0000-0000-000000000001",
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-29T23:59:59.999Z",
      scoreMin: 80,
      scoreMax: 100,
      scoreBand: "80-100",
      page: 3,
      pageSize: 10,
    });
  });

  it("drops malformed filters instead of widening SQL input", () => {
    expect(
      parseHistoryFilters({
        kind: "administrator",
        chapter: "not-a-uuid",
        from: "29/07/2026",
        to: "tomorrow",
        score: "101-999",
        page: "-8",
      }),
    ).toEqual({
      kind: null,
      chapterId: null,
      dateFrom: null,
      dateTo: null,
      scoreMin: null,
      scoreMax: null,
      scoreBand: null,
      page: 1,
      pageSize: 10,
    });
  });
});
