import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseQuestionMarkdown } from "../src/features/question-bank/parse-markdown";
import type {
  ParsedQuestion,
  ParseIssue,
  ValidationIssue,
} from "../src/features/question-bank/types";
import { validateQuestion } from "../src/features/question-bank/validate-question";

export const EXPECTED_COUNTS = [49, 87, 111, 60, 90, 100] as const;

export type KtctSeedQuestion = ParsedQuestion & {
  chapter: number;
};

export type KtctSeedIssue = ParseIssue & {
  chapter: number;
};

export type KtctSeedBuild = {
  questions: KtctSeedQuestion[];
  issues: KtctSeedIssue[];
};

function formatValidationFailure(
  chapter: number,
  question: ParsedQuestion,
  issues: ValidationIssue[],
): string {
  const details = issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("; ");
  return `Chapter ${chapter}, source question ${question.sourceNumber}: ${details}`;
}

export function buildKtctSeed(projectRoot: string): KtctSeedBuild {
  const questions: KtctSeedQuestion[] = [];
  const issues: KtctSeedIssue[] = [];
  const validationFailures: string[] = [];

  EXPECTED_COUNTS.forEach((expectedCount, index) => {
    const chapter = index + 1;
    const sourcePath = path.join(
      projectRoot,
      "content",
      "ktct",
      `chapter-${chapter}.md`,
    );
    const result = parseQuestionMarkdown(readFileSync(sourcePath, "utf8"));

    if (result.questions.length !== expectedCount) {
      validationFailures.push(
        `Chapter ${chapter}: expected ${expectedCount} questions, parsed ${result.questions.length}.`,
      );
    }

    for (const question of result.questions) {
      const questionIssues = validateQuestion(question);

      if (questionIssues.length > 0) {
        validationFailures.push(
          formatValidationFailure(chapter, question, questionIssues),
        );
      }

      questions.push({ chapter, ...question });
    }

    issues.push(
      ...result.issues.map((issue) => ({
        chapter,
        ...issue,
      })),
    );
  });

  if (validationFailures.length > 0) {
    throw new Error(
      `KTCT seed validation failed:\n${validationFailures.join("\n")}`,
    );
  }

  return { questions, issues };
}

export function writeKtctSeed(projectRoot: string): KtctSeedBuild {
  const result = buildKtctSeed(projectRoot);
  const seedDirectory = path.join(projectRoot, "seed");
  const outputPath = path.join(seedDirectory, "ktct.json");

  mkdirSync(seedDirectory, { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(result.questions, null, 2)}\n`,
    "utf8",
  );

  return result;
}

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === executedPath) {
  const projectRoot = process.cwd();
  const result = writeKtctSeed(projectRoot);

  for (const [index, expectedCount] of EXPECTED_COUNTS.entries()) {
    console.log(`Chapter ${index + 1}: ${expectedCount} questions`);
  }

  for (const issue of result.issues) {
    console.warn(
      `Warning [chapter ${issue.chapter}, line ${issue.line}, ${issue.code}]: ${issue.message}`,
    );
  }

  console.log(`Wrote ${result.questions.length} questions to seed/ktct.json`);
}
