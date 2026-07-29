import type {
  OptionLabel,
  ParsedQuestion,
  ParseIssue,
  ParseResult,
} from "./types";

const QUESTION_HEADER = /^Câu\s+(\d+)\s*[:.]\s*(.*)$/gim;
const INLINE_ANSWER =
  /\*{0,2}\s*Đáp án đúng\s*:\s*([A-Da-d])\s*\*{0,2}/iu;
const EXPLANATION_MARKER =
  /\*{0,2}\s*Giải thích\s*:\s*\*{0,2}\s*/iu;
const OPTION_LABELS: OptionLabel[] = ["A", "B", "C", "D"];

type QuestionSegment = {
  number: number;
  headerText: string;
  body: string;
  line: number;
};

type OptionMarker = {
  label: OptionLabel;
  markerStart: number;
  contentStart: number;
  lineStart: boolean;
};

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/giu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function questionSegments(source: string): QuestionSegment[] {
  const matches = [...source.matchAll(QUESTION_HEADER)];

  return matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;

    return {
      number: Number.parseInt(match[1], 10),
      headerText: match[2],
      body: source.slice(bodyStart, bodyEnd),
      line: source.slice(0, match.index).split("\n").length,
    };
  });
}

function optionMarkers(value: string): OptionMarker[] {
  const broadPattern = /(?:^|\s)([A-Da-d])\.\s+/gu;
  const markers: OptionMarker[] = [];
  let match: RegExpExecArray | null;

  while ((match = broadPattern.exec(value)) !== null) {
    const prefixLength = match[0].length - match[0].trimStart().length;
    const markerStart = match.index + prefixLength;
    const preceding = value.slice(0, markerStart);
    const lineStart = markerStart === 0 || /\n[ \t]*$/u.test(preceding);

    markers.push({
      label: match[1].toUpperCase() as OptionLabel,
      markerStart,
      contentStart: match.index + match[0].length,
      lineStart,
    });

    // Continue just after the marker instead of after its trailing whitespace.
    // That keeps a real next-line label visible when option text ends in "A.".
    broadPattern.lastIndex = markerStart + 2;
  }

  return markers;
}

function orderedOptionMarkers(value: string): OptionMarker[] {
  const candidates = optionMarkers(value);
  const selected: OptionMarker[] = [];
  let after = -1;

  for (const label of OPTION_LABELS) {
    const candidatesForLabel = candidates.filter(
      (candidate) =>
        candidate.label === label && candidate.markerStart > after,
    );
    const marker =
      candidatesForLabel.find((candidate) => candidate.lineStart) ??
      candidatesForLabel[0];

    if (!marker) {
      return [];
    }

    selected.push(marker);
    after = marker.markerStart;
  }

  return selected;
}

function parseOptions(value: string): ParsedQuestion["options"] {
  const markers = orderedOptionMarkers(value);

  return markers.map((marker, index) => ({
    label: marker.label,
    content: normalizeMarkdown(
      value.slice(
        marker.contentStart,
        markers[index + 1]?.markerStart ?? value.length,
      ),
    ),
  }));
}

function parseQuestion(
  segment: QuestionSegment,
  sourceNumber: number,
  sharedLeadIn: string,
): ParsedQuestion | null {
  const answerMatch = INLINE_ANSWER.exec(segment.body);
  const beforeAnswer = answerMatch
    ? segment.body.slice(0, answerMatch.index)
    : segment.body;
  const markers = orderedOptionMarkers(beforeAnswer);

  if (markers.length === 0) {
    return null;
  }

  const prompt = normalizeMarkdown(
    [segment.headerText, beforeAnswer.slice(0, markers[0].markerStart)].join(
      "\n",
    ),
  );
  const explanationMatch = EXPLANATION_MARKER.exec(segment.body);
  const explanationWithTrailingContent = explanationMatch
    ? segment.body.slice(
        (explanationMatch.index ?? 0) + explanationMatch[0].length,
      )
    : "";
  const explanation = normalizeMarkdown(
    explanationWithTrailingContent.split(/^\s*ĐÁP ÁN\s*$/imu, 1)[0],
  );

  return {
    sourceNumber,
    content: normalizeMarkdown(
      sharedLeadIn ? `${sharedLeadIn}\n\n${prompt}` : prompt,
    ),
    options: parseOptions(beforeAnswer.slice(markers[0].markerStart)),
    correctLabel: (answerMatch?.[1].toUpperCase() ?? "") as OptionLabel,
    explanation,
  };
}

function orphanAnswerIssues(
  source: string,
  sourceQuestionNumbers: Set<number>,
): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const rowPattern =
    /^\|\s*(?:Câu\s*)?(\d+)\s*\|\s*([A-Da-d])\s*\|.*$/gimu;

  for (const match of source.matchAll(rowPattern)) {
    const number = Number.parseInt(match[1], 10);

    if (!sourceQuestionNumbers.has(number)) {
      issues.push({
        line: source.slice(0, match.index).split("\n").length,
        code: "orphan-answer-row",
        message: `Answer table row ${number} has no source question.`,
      });
    }
  }

  return issues;
}

export function parseQuestionMarkdown(source: string): ParseResult {
  const normalizedSource = source.replace(/\r\n?/g, "\n");
  const segments = questionSegments(normalizedSource);
  const sourceQuestionNumbers = new Set<number>();
  const questions: ParsedQuestion[] = [];
  let sharedLeadIn = "";
  let sharedLeadNumber = 0;
  let sharedLeadOffset = 0;

  for (const segment of segments) {
    const markers = orderedOptionMarkers(
      INLINE_ANSWER.exec(segment.body)
        ? segment.body.slice(
            0,
            INLINE_ANSWER.exec(segment.body)?.index ?? segment.body.length,
          )
        : segment.body,
    );

    if (markers.length === 0) {
      const leadBody = segment.body.split(/^\s*ĐÁP ÁN\s*$/imu, 1)[0];
      sharedLeadIn = normalizeMarkdown(
        `${segment.headerText}\n${leadBody}`,
      );
      sharedLeadNumber = segment.number;
      sharedLeadOffset = 0;
      sourceQuestionNumbers.add(segment.number);
      continue;
    }

    sourceQuestionNumbers.add(segment.number);
    const sourceNumber = sharedLeadIn
      ? sharedLeadNumber + sharedLeadOffset++
      : segment.number;
    const question = parseQuestion(
      segment,
      sourceNumber,
      sharedLeadIn,
    );

    if (question) {
      questions.push(question);
    }
  }

  return {
    questions,
    issues: orphanAnswerIssues(normalizedSource, sourceQuestionNumbers),
  };
}
