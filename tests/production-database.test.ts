import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  seedProduction,
  verifyProductionCounts,
} from "@/scripts/production/database";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const adminId = "00000000-0000-0000-0000-000000000001";

type Row = Record<string, unknown>;

class MemoryProductionClient {
  tables = new Map<string, Row[]>([
    ["courses", []],
    ["chapters", []],
    ["questions", []],
    ["question_options", []],
    ["exam_configs", []],
  ]);

  from(table: string) {
    return new MemoryQuery(this, table);
  }
}

class MemoryQuery implements PromiseLike<unknown> {
  private operation: "select" | "insert" | "upsert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private head = false;
  private filters: Array<[string, unknown]> = [];
  private rangeStart = 0;
  private rangeEnd = Number.POSITIVE_INFINITY;

  constructor(
    private client: MemoryProductionClient,
    private table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.head = options?.head === true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[]) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push([column, new Set(values)]);
    return this;
  }

  order() {
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  async single() {
    const result = await this.execute();
    const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
    return { data, error: data ? null : { code: "PGRST116" } };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every(([column, expected]) =>
      column === "questions.status"
        ? true
        :
      expected instanceof Set
        ? expected.has(row[column])
        : row[column] === expected,
    );
  }

  private async execute(): Promise<{
    data: Row[] | Row | null;
    error: null;
    count?: number;
  }> {
    const rows = this.client.tables.get(this.table);
    if (!rows) throw new Error(`Unexpected table: ${this.table}`);

    if (this.operation === "insert") {
      const inserted = (Array.isArray(this.payload)
        ? this.payload
        : [this.payload!]
      ).map((row, index) => ({
        ...row,
        id:
          row.id ??
          `${this.table}-${String(rows.length + index + 1).padStart(4, "0")}`,
      }));
      rows.push(...inserted);
      return { data: inserted, error: null };
    }

    if (this.operation === "upsert") {
      const incoming = Array.isArray(this.payload)
        ? this.payload
        : [this.payload!];
      const stored: Row[] = [];
      for (const [index, value] of incoming.entries()) {
        const row: Row = {
          ...value,
          id:
            value.id ??
            (this.table === "chapters"
              ? `chapter-${value.position}`
              : `${this.table}-${String(rows.length + index + 1).padStart(4, "0")}`),
        };
        const existingIndex =
          this.table === "chapters"
            ? rows.findIndex(
                (candidate) =>
                  candidate.course_id === row.course_id &&
                  candidate.position === row.position,
              )
            : rows.findIndex((candidate) => candidate.id === row.id);
        if (existingIndex === -1) rows.push(row);
        else rows[existingIndex] = { ...rows[existingIndex], ...row };
        stored.push(row);
      }
      return { data: stored, error: null };
    }

    if (this.operation === "update") {
      for (const row of rows.filter((candidate) => this.matches(candidate))) {
        Object.assign(row, this.payload);
      }
      return { data: null, error: null };
    }

    let selected = rows.filter((row) => this.matches(row));
    if (this.table === "question_options" && this.filters.some(([key]) => key === "questions.status")) {
      const questions = this.client.tables.get("questions") ?? [];
      selected = selected.filter((option) =>
        questions.some(
          (question) =>
            question.id === option.question_id &&
            question.status === "published",
        ),
      );
    }
    if (this.head) {
      return { data: [], count: selected.length, error: null };
    }
    return {
      data: selected.slice(this.rangeStart, this.rangeEnd + 1),
      error: null,
    };
  }
}

function asSupabase(client: MemoryProductionClient) {
  return client as unknown as SupabaseClient;
}

describe("production mock exam provisioning", () => {
  it("seeds exactly one deterministic active 40-question, 60-minute config on repeated setup", async () => {
    const client = new MemoryProductionClient();

    await seedProduction(asSupabase(client), projectRoot, adminId);
    await seedProduction(asSupabase(client), projectRoot, adminId);

    expect(client.tables.get("exam_configs")).toEqual([
      expect.objectContaining({
        course_id: expect.any(String),
        title: "Thi thử tổng hợp",
        kind: "mock_exam",
        question_count: 40,
        duration_seconds: 3600,
        is_active: true,
      }),
    ]);
    await expect(
      verifyProductionCounts(asSupabase(client)),
    ).resolves.toMatchObject({ activeMockExamConfigs: 1 });
  });

  it.each([
    ["missing", []],
    [
      "inactive",
      [
        {
          id: "config-1",
          course_id: "course-1",
          kind: "mock_exam",
          question_count: 40,
          duration_seconds: 3600,
          is_active: false,
        },
      ],
    ],
    [
      "duplicate",
      [
        {
          id: "config-1",
          course_id: "course-1",
          kind: "mock_exam",
          question_count: 40,
          duration_seconds: 3600,
          is_active: true,
        },
        {
          id: "config-2",
          course_id: "course-1",
          kind: "mock_exam",
          question_count: 40,
          duration_seconds: 3600,
          is_active: true,
        },
      ],
    ],
    [
      "invalid shape",
      [
        {
          id: "config-1",
          course_id: "course-1",
          kind: "mock_exam",
          question_count: 20,
          duration_seconds: 1800,
          is_active: true,
        },
      ],
    ],
  ])("rejects a %s production mock-exam configuration", async (_label, configs) => {
    const client = new MemoryProductionClient();
    client.tables.set("courses", [{ id: "course-1" }]);
    client.tables.set(
      "chapters",
      Array.from({ length: 6 }, (_, index) => ({ id: `chapter-${index}` })),
    );
    client.tables.set(
      "questions",
      Array.from({ length: 497 }, (_, index) => ({
        id: `question-${index}`,
        status: "published",
      })),
    );
    client.tables.set(
      "question_options",
      Array.from({ length: 1_988 }, (_, index) => ({
        id: `option-${index}`,
        question_id: `question-${Math.floor(index / 4)}`,
      })),
    );
    client.tables.set("exam_configs", configs);

    await expect(verifyProductionCounts(asSupabase(client))).rejects.toThrow(
      /active_mock_exam_configs=/,
    );
  });
});
