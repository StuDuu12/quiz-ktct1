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
  private countRequested = false;
  private filters: Array<[string, unknown]> = [];
  private rangeStart = 0;
  private rangeEnd = Number.POSITIVE_INFINITY;
  private orderColumn: string | null = null;

  constructor(
    private client: MemoryProductionClient,
    private table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.head = options?.head === true;
    this.countRequested = options?.count === "exact";
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

  order(column: string) {
    this.orderColumn = column;
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

  async maybeSingle() {
    const result = await this.execute();
    const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
    return { data, error: null };
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
      column.startsWith("questions.")
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
    if (
      this.table === "question_options" &&
      this.filters.some(([key]) => key.startsWith("questions."))
    ) {
      const questions = this.client.tables.get("questions") ?? [];
      selected = selected.filter((option) =>
        questions.some(
          (question) =>
            question.id === option.question_id &&
            this.filters
              .filter(([column]) => column.startsWith("questions."))
              .every(([column, expected]) => {
                const questionColumn = column.slice("questions.".length);
                return expected instanceof Set
                  ? expected.has(question[questionColumn])
                  : question[questionColumn] === expected;
              }),
        ),
      );
    }
    if (this.head) {
      return { data: [], count: selected.length, error: null };
    }
    if (this.orderColumn) {
      selected = selected.toSorted((left, right) =>
        String(left[this.orderColumn!]).localeCompare(
          String(right[this.orderColumn!]),
        ),
      );
    }
    return {
      data: selected.slice(this.rangeStart, this.rangeEnd + 1),
      error: null,
      ...(this.countRequested ? { count: selected.length } : {}),
    };
  }
}

function asSupabase(client: MemoryProductionClient) {
  return client as unknown as SupabaseClient;
}

function populateVerifiedContent(
  client: MemoryProductionClient,
  courses: Row[] = [
    {
      id: "course-1",
      slug: "kinh-te-chinh-tri-mac-lenin",
    },
  ],
) {
  client.tables.set("courses", courses);
  appendCourseContent(client, "course-1", "target", 6, 497);
}

function appendCourseContent(
  client: MemoryProductionClient,
  courseId: string,
  prefix: string,
  chapterCount: number,
  questionCount: number,
) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `${prefix}-chapter-${index}`,
    course_id: courseId,
  }));
  const questions = Array.from({ length: questionCount }, (_, index) => ({
    id: `${prefix}-question-${index}`,
    chapter_id: chapters[index % chapters.length]?.id,
    status: "published",
  }));
  const options = questions.flatMap((question, questionIndex) =>
    Array.from({ length: 4 }, (_, optionIndex) => ({
      id: `${prefix}-option-${questionIndex}-${optionIndex}`,
      question_id: question.id,
    })),
  );
  client.tables.get("chapters")!.push(...chapters);
  client.tables.get("questions")!.push(...questions);
  client.tables.get("question_options")!.push(...options);
}

describe("production mock exam provisioning", () => {
  it("persists every Markdown practice position and repairs position drift", async () => {
    const client = new MemoryProductionClient();

    await seedProduction(asSupabase(client), projectRoot, adminId);

    const chapters = client.tables.get("chapters")!;
    const questions = client.tables.get("questions")!;
    for (const chapter of chapters) {
      const chapterPositions = questions
        .filter((question) => question.chapter_id === chapter.id)
        .map((question) => question.practice_position);
      expect(chapterPositions).toEqual(
        Array.from({ length: chapterPositions.length }, (_, index) => index + 1),
      );
    }

    questions[0]!.practice_position = null;
    await seedProduction(asSupabase(client), projectRoot, adminId);
    expect(questions[0]!.practice_position).toBe(1);
  });

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

  it("reuses one legacy active config instead of creating a deterministic duplicate", async () => {
    const client = new MemoryProductionClient();
    const legacyId = "10000000-0000-0000-0000-000000000001";
    client.tables.set("exam_configs", [
      {
        id: legacyId,
        course_id: "courses-0001",
        title: "Đề cũ",
        kind: "mock_exam",
        question_count: 20,
        duration_seconds: 1_800,
        is_active: true,
        created_by: adminId,
      },
    ]);

    await seedProduction(asSupabase(client), projectRoot, adminId);
    await seedProduction(asSupabase(client), projectRoot, adminId);

    expect(client.tables.get("exam_configs")).toEqual([
      expect.objectContaining({
        id: legacyId,
        course_id: "courses-0001",
        question_count: 40,
        duration_seconds: 3_600,
        is_active: true,
      }),
    ]);
  });

  it("keeps duplicate legacy rows but deterministically deactivates all except one", async () => {
    const client = new MemoryProductionClient();
    const firstId = "10000000-0000-0000-0000-000000000001";
    const secondId = "10000000-0000-0000-0000-000000000002";
    client.tables.set("exam_configs", [
      {
        id: secondId,
        course_id: "courses-0001",
        title: "Đề cũ 2",
        kind: "mock_exam",
        question_count: 20,
        duration_seconds: 1_800,
        is_active: true,
        created_by: adminId,
      },
      {
        id: firstId,
        course_id: "courses-0001",
        title: "Đề cũ 1",
        kind: "mock_exam",
        question_count: 30,
        duration_seconds: 2_700,
        is_active: true,
        created_by: adminId,
      },
    ]);

    await seedProduction(asSupabase(client), projectRoot, adminId);
    await seedProduction(asSupabase(client), projectRoot, adminId);

    const configs = client.tables.get("exam_configs")!;
    expect(configs).toHaveLength(2);
    expect(configs.filter(({ is_active }) => is_active)).toEqual([
      expect.objectContaining({
        id: firstId,
        question_count: 40,
        duration_seconds: 3_600,
      }),
    ]);
    expect(configs.find(({ id }) => id === secondId)).toMatchObject({
      is_active: false,
    });
  });

  it("counts only the KTCT active config when another course also has one", async () => {
    const client = new MemoryProductionClient();
    populateVerifiedContent(client, [
      { id: "course-1", slug: "kinh-te-chinh-tri-mac-lenin" },
      { id: "course-2", slug: "another-course" },
    ]);
    client.tables.set("exam_configs", [
      {
        id: "config-1",
        course_id: "course-1",
        kind: "mock_exam",
        question_count: 40,
        duration_seconds: 3_600,
        is_active: true,
      },
      {
        id: "config-2",
        course_id: "course-2",
        kind: "mock_exam",
        question_count: 40,
        duration_seconds: 3_600,
        is_active: true,
      },
    ]);
    appendCourseContent(client, "course-2", "other", 6, 497);

    await expect(
      verifyProductionCounts(asSupabase(client)),
    ).resolves.toMatchObject({
      courses: 1,
      chapters: 6,
      questions: 497,
      publishedQuestionOptions: 1_988,
      activeMockExamConfigs: 1,
    });
  });

  it("does not accept another course's active config for KTCT", async () => {
    const client = new MemoryProductionClient();
    populateVerifiedContent(client, [
      { id: "course-1", slug: "kinh-te-chinh-tri-mac-lenin" },
      { id: "course-2", slug: "another-course" },
    ]);
    client.tables.set("exam_configs", [
      {
        id: "config-2",
        course_id: "course-2",
        kind: "mock_exam",
        question_count: 40,
        duration_seconds: 3_600,
        is_active: true,
      },
    ]);

    await expect(verifyProductionCounts(asSupabase(client))).rejects.toThrow(
      /active_mock_exam_configs=0/,
    );
  });

  it("does not let another course compensate for missing KTCT content", async () => {
    const client = new MemoryProductionClient();
    client.tables.set("courses", [
      { id: "course-1", slug: "kinh-te-chinh-tri-mac-lenin" },
      { id: "course-2", slug: "another-course" },
    ]);
    appendCourseContent(client, "course-1", "target", 5, 496);
    appendCourseContent(client, "course-2", "other", 1, 1);
    client.tables.set("exam_configs", [
      {
        id: "config-1",
        course_id: "course-1",
        kind: "mock_exam",
        question_count: 40,
        duration_seconds: 3_600,
        is_active: true,
      },
    ]);

    await expect(verifyProductionCounts(asSupabase(client))).rejects.toThrow(
      /chapters=5, questions=496, published_question_options=1984/,
    );
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
    populateVerifiedContent(client);
    client.tables.set("exam_configs", configs);

    await expect(verifyProductionCounts(asSupabase(client))).rejects.toThrow(
      /active_mock_exam_configs=/,
    );
  });
});
