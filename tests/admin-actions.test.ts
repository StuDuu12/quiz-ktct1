import { describe, expect, it } from "vitest";

import {
  assertCourseManagementScope,
  assertUserAdministrationRole,
  previewImport,
  validateQuestionForStatus,
} from "@/src/features/admin/actions";

const validMarkdownQuestion = (number: number, answer: "A" | "B" | "C" | "D" = "B") =>
  [
    `Câu ${number}: Nội dung câu hỏi ${number}?`,
    "",
    "A. Phương án một",
    "",
    "B. Phương án hai",
    "",
    "C. Phương án ba",
    "",
    "D. Phương án bốn",
    "",
    `**Đáp án đúng: ${answer}**`,
    "",
    "**Giải thích:** Giải thích đầy đủ.",
  ].join("\n");

describe("admin authorization boundaries", () => {
  it("prevents instructors from administering users", () => {
    expect(() => assertUserAdministrationRole("instructor")).toThrow(
      "FORBIDDEN",
    );
    expect(() => assertUserAdministrationRole("student")).toThrow(
      "FORBIDDEN",
    );
    expect(() => assertUserAdministrationRole("admin")).not.toThrow();
  });

  it("lets instructors manage only explicitly assigned courses", () => {
    expect(() =>
      assertCourseManagementScope({
        actorRole: "instructor",
        courseId: "course-assigned",
        assignedCourseIds: ["course-assigned"],
      }),
    ).not.toThrow();
    expect(() =>
      assertCourseManagementScope({
        actorRole: "instructor",
        courseId: "course-other",
        assignedCourseIds: ["course-assigned"],
      }),
    ).toThrow("FORBIDDEN");
    expect(() =>
      assertCourseManagementScope({
        actorRole: "admin",
        courseId: "course-other",
        assignedCourseIds: [],
      }),
    ).not.toThrow();
  });
});

describe("question publication validation", () => {
  const options = [
    { label: "A" as const, content: "Một", isCorrect: false },
    { label: "B" as const, content: "Hai", isCorrect: true },
    { label: "C" as const, content: "Ba", isCorrect: false },
    { label: "D" as const, content: "Bốn", isCorrect: false },
  ];

  it("requires exactly A-D and one correct answer before publication", () => {
    expect(
      validateQuestionForStatus({
        content: "Nội dung",
        explanation: "Giải thích",
        status: "published",
        options,
      }),
    ).toEqual([]);
    expect(
      validateQuestionForStatus({
        content: "Nội dung",
        explanation: "Giải thích",
        status: "published",
        options: options.slice(0, 3),
      }),
    ).toContainEqual(expect.objectContaining({ code: "exactly-four-options" }));
    expect(
      validateQuestionForStatus({
        content: "Nội dung",
        explanation: "Giải thích",
        status: "published",
        options: options.map((option) => ({ ...option, isCorrect: false })),
      }),
    ).toContainEqual(expect.objectContaining({ code: "exactly-one-correct" }));
  });

  it("allows an incomplete draft but never blank question content", () => {
    expect(
      validateQuestionForStatus({
        content: "Bản nháp đang biên soạn",
        explanation: "",
        status: "draft",
        options: [],
      }),
    ).toEqual([]);
    expect(
      validateQuestionForStatus({
        content: " ",
        explanation: "",
        status: "draft",
        options: [],
      }),
    ).toContainEqual(expect.objectContaining({ code: "missing-content" }));
  });
});

describe("Markdown import preview", () => {
  it("reports valid, issue, and duplicate counts before confirmation", () => {
    const markdown = [
      validMarkdownQuestion(1),
      "",
      validMarkdownQuestion(1),
      "",
      [
        "Câu 2: Câu lỗi?",
        "",
        "A. Một",
        "",
        "B. Hai",
        "",
        "C. Ba",
        "",
        "**Đáp án đúng: B**",
        "",
        "**Giải thích:** Thiếu D.",
      ].join("\n"),
      "",
      validMarkdownQuestion(3),
    ].join("\n\n");

    const preview = previewImport(markdown, "chapter-1");

    expect(preview).toMatchObject({
      chapterId: "chapter-1",
      parsedCount: 3,
      validCount: 2,
      duplicateCount: 1,
    });
    expect(preview.issueCount).toBeGreaterThanOrEqual(1);
    expect(preview.duplicateSourceNumbers).toEqual([1]);
    expect(preview.confirmationRequired).toBe(true);
    expect(preview.importableQuestions.map((question) => question.sourceNumber)).toEqual([
      1,
      3,
    ]);
  });

  it("does not invent a successful preview for empty input", () => {
    expect(previewImport("   ", "chapter-1")).toMatchObject({
      parsedCount: 0,
      validCount: 0,
      duplicateCount: 0,
      confirmationRequired: false,
    });
  });
});
