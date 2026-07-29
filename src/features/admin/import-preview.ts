import { parseQuestionMarkdown } from "@/src/features/question-bank/parse-markdown";
import type {
  ParsedQuestion,
  ParseIssue,
} from "@/src/features/question-bank/types";
import { validateQuestion } from "@/src/features/question-bank/validate-question";

export type ImportPreview = {
  chapterId: string;
  parsedCount: number;
  validCount: number;
  issueCount: number;
  duplicateCount: number;
  duplicateSourceNumbers: number[];
  issues: ParseIssue[];
  importableQuestions: ParsedQuestion[];
  confirmationRequired: boolean;
};

export function previewImport(
  markdown: string,
  chapterId: string,
): ImportPreview {
  const parsed = parseQuestionMarkdown(markdown);
  const validationIssues: ParseIssue[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  const importableQuestions: ParsedQuestion[] = [];

  for (const question of parsed.questions) {
    if (seen.has(question.sourceNumber)) {
      duplicates.add(question.sourceNumber);
      continue;
    }
    seen.add(question.sourceNumber);
    const questionIssues = validateQuestion(question);
    if (questionIssues.length) {
      validationIssues.push(
        ...questionIssues.map((issue) => ({
          line: 0,
          code: issue.code,
          message: `Câu ${question.sourceNumber}: ${issue.message}`,
        })),
      );
      continue;
    }
    importableQuestions.push(question);
  }

  const issues = [...parsed.issues, ...validationIssues];
  return {
    chapterId,
    parsedCount: parsed.questions.length,
    validCount: importableQuestions.length,
    issueCount: issues.length,
    duplicateCount: duplicates.size,
    duplicateSourceNumbers: [...duplicates].sort((left, right) => left - right),
    issues,
    importableQuestions,
    confirmationRequired: importableQuestions.length > 0,
  };
}
