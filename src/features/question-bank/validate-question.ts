import type {
  OptionLabel,
  ParsedQuestion,
  ValidationIssue,
} from "./types";

const OPTION_LABELS: OptionLabel[] = ["A", "B", "C", "D"];

export function validateQuestion(
  question: ParsedQuestion,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const labels = question.options.map((option) => option.label);
  const hasValidOptions =
    question.options.length === OPTION_LABELS.length &&
    OPTION_LABELS.every(
      (label) =>
        labels.filter((candidate) => candidate === label).length === 1 &&
        question.options.find((option) => option.label === label)?.content.trim(),
    );

  if (!hasValidOptions) {
    issues.push({
      code: "invalid-options",
      message: "Question must contain one non-empty option for each label A–D.",
    });
  }

  if (!OPTION_LABELS.includes(question.correctLabel)) {
    issues.push({
      code: "missing-correct-answer",
      message: "Question must have one inline correct answer labeled A–D.",
    });
  }

  if (!question.explanation.trim()) {
    issues.push({
      code: "missing-explanation",
      message: "Question must have a non-empty inline explanation.",
    });
  }

  return issues;
}
