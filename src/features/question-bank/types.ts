export type OptionLabel = "A" | "B" | "C" | "D";

export type ParsedQuestion = {
  sourceNumber: number;
  content: string;
  options: { label: OptionLabel; content: string }[];
  correctLabel: OptionLabel;
  explanation: string;
};

export type ParseIssue = {
  line: number;
  code: string;
  message: string;
};

export type ParseResult = {
  questions: ParsedQuestion[];
  issues: ParseIssue[];
};

export type ValidationIssue = {
  code: string;
  message: string;
};
