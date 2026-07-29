import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseQuestionMarkdown } from "@/src/features/question-bank/parse-markdown";
import { validateQuestion } from "@/src/features/question-bank/validate-question";
import { buildKtctSeed } from "@/scripts/build-ktct-seed";

const completeQuestion = ({
  number = 1,
  optionA = "Một",
}: {
  number?: number;
  optionA?: string;
} = {}) =>
  [
    `Câu ${number}: Nội dung?`,
    "",
    `A. ${optionA}`,
    "",
    "B. Hai",
    "",
    "C. Ba",
    "",
    "D. Bốn",
    "",
    "**Đáp án đúng: B**",
    "",
    "**Giải thích:** Giải thích mẫu.",
  ].join("\n");

describe("parseQuestionMarkdown", () => {
  it("splits an option that is joined to the previous line", () => {
    const source = completeQuestion({ optionA: "Một B. Hai C. Ba D. Bốn" })
      .replace(/\n\nB\. Hai\n\nC\. Ba\n\nD\. Bốn/, "");

    const result = parseQuestionMarkdown(source);

    expect(result.questions[0].options).toEqual([
      { label: "A", content: "Một" },
      { label: "B", content: "Hai" },
      { label: "C", content: "Ba" },
      { label: "D", content: "Bốn" },
    ]);
  });

  it("normalizes a lowercase option label", () => {
    const result = parseQuestionMarkdown(
      completeQuestion().replace("A. Một", "a. Một"),
    );

    expect(result.questions[0].options[0]).toEqual({
      label: "A",
      content: "Một",
    });
  });

  it("does not let label-like text hide the next real option", () => {
    const source = completeQuestion({
      optionA: "So sánh xí nghiệp B với xí nghiệp A.",
    });

    const result = parseQuestionMarkdown(source);

    expect(result.questions[0].options.map((option) => option.label)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("turns the four Chapter 1 subquestions after the Câu 46 lead-in into questions 46–49", () => {
    const source = [
      "Câu 46. Hãy đọc thông tin dưới đây và trả lời câu hỏi",
      "",
      "“Đây là lời dẫn dùng chung.”",
      "",
      ...[1, 2, 3, 4].flatMap((number) => [
        `Câu ${number}. Tiểu câu ${number}?`,
        "",
        "A. Một",
        "",
        "B. Hai",
        "",
        "C. Ba",
        "",
        "D. Bốn",
        "",
        "**Đáp án đúng: B**",
        "",
        `**Giải thích:** Giải thích ${number}.`,
        "",
      ]),
    ].join("\n");

    const result = parseQuestionMarkdown(source);

    expect(result.questions.map((question) => question.sourceNumber)).toEqual([
      46, 47, 48, 49,
    ]);
    expect(result.questions[0].content).toContain(
      "“Đây là lời dẫn dùng chung.”",
    );
    expect(result.questions[0].content).toContain("Tiểu câu 1?");
  });

  it("does not import a Markdown answer table into question content", () => {
    const source = [
      completeQuestion(),
      "",
      "ĐÁP ÁN",
      "",
      "| Câu số | Đáp án | Giải thích ngắn gọn |",
      "| --- | --- | --- |",
      "| 1 | B | Dòng đáp án tổng hợp |",
    ].join("\n");

    const result = parseQuestionMarkdown(source);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].explanation).toBe("Giải thích mẫu.");
    expect(result.questions[0].content).not.toContain("ĐÁP ÁN");
    expect(result.questions[0].content).not.toContain("| Câu số |");
  });

  it("reports an answer-table row with no source question instead of inventing it", () => {
    const source = [
      completeQuestion({ number: 6 }),
      "",
      completeQuestion({ number: 8 }),
      "",
      "ĐÁP ÁN",
      "",
      "| Câu số | Đáp án | Giải thích ngắn gọn |",
      "| --- | --- | --- |",
      "| 6 | B | Có câu nguồn |",
      "| 7 | A | Không có câu nguồn |",
      "| 8 | B | Có câu nguồn |",
    ].join("\n");

    const result = parseQuestionMarkdown(source);

    expect(result.questions.map((question) => question.sourceNumber)).toEqual([
      6, 8,
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "orphan-answer-row",
          message: expect.stringContaining("7"),
        }),
      ]),
    );
  });

  it("parses both question sections separated by an answer table", () => {
    const source = [
      completeQuestion({ number: 1 }),
      "",
      "ĐÁP ÁN",
      "",
      "| Câu số | Đáp án |",
      "| --- | --- |",
      "| 1 | B |",
      "",
      "II. PHẦN HAI",
      "",
      completeQuestion({ number: 1 }),
      "",
      "ĐÁP ÁN",
      "",
      "| Câu số | Đáp án |",
      "| --- | --- |",
      "| 1 | B |",
    ].join("\n");

    const result = parseQuestionMarkdown(source);

    expect(result.questions).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });
});

describe("verified KTCT sources", () => {
  const expectedCounts = [49, 87, 111, 60, 90, 100];

  it.each(expectedCounts.map((count, index) => [index + 1, count]))(
    "parses Chapter %i with exactly %i valid questions",
    (chapter, expectedCount) => {
      const source = readFileSync(
        path.join(process.cwd(), "content", "ktct", `chapter-${chapter}.md`),
        "utf8",
      );
      const result = parseQuestionMarkdown(source);

      expect(result.questions).toHaveLength(expectedCount);
      expect(
        result.questions.flatMap((question) => validateQuestion(question)),
      ).toEqual([]);
    },
  );

  it("reports only the verified orphan answer row for Chapter 3", () => {
    const source = readFileSync(
      path.join(process.cwd(), "content", "ktct", "chapter-3.md"),
      "utf8",
    );

    expect(parseQuestionMarkdown(source).issues).toEqual([
      expect.objectContaining({
        code: "orphan-answer-row",
        message: expect.stringContaining("7"),
      }),
    ]);
  });

  it("renumbers the four Chapter 1 subquestions without losing their lead-in", () => {
    const source = readFileSync(
      path.join(process.cwd(), "content", "ktct", "chapter-1.md"),
      "utf8",
    );
    const questions = parseQuestionMarkdown(source).questions;

    expect(questions.slice(-4).map((question) => question.sourceNumber)).toEqual([
      46, 47, 48, 49,
    ]);
    expect(questions[45].content).toContain(
      "Hãy đọc thông tin dưới đây và trả lời câu hỏi",
    );
    expect(questions[45].content).not.toContain("ĐÁP ÁN");
  });

  it("builds the same 497-question seed on every run", () => {
    const first = buildKtctSeed(process.cwd());
    const second = buildKtctSeed(process.cwd());

    expect(first.questions).toEqual(second.questions);
    expect(first.questions).toHaveLength(497);
    expect(
      first.questions.reduce<Record<number, number>>((counts, question) => {
        counts[question.chapter] = (counts[question.chapter] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ 1: 49, 2: 87, 3: 111, 4: 60, 5: 90, 6: 100 });
    expect(first.issues).toEqual([
      expect.objectContaining({
        chapter: 3,
        code: "orphan-answer-row",
      }),
    ]);
  });
});

describe("validateQuestion", () => {
  it("reports missing A–D options, correct answer, and explanation", () => {
    expect(
      validateQuestion({
        sourceNumber: 1,
        content: "Nội dung",
        options: [{ label: "A", content: "Một" }],
        correctLabel: "" as "A",
        explanation: "",
      }).map((issue) => issue.code),
    ).toEqual([
      "invalid-options",
      "missing-correct-answer",
      "missing-explanation",
    ]);
  });
});
