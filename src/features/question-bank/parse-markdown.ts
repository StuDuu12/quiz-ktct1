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
const ANSWER_DATA_BOUNDARY =
  /^\s*(?:ĐÁP ÁN\s*$|\|\s*Câu số\s*\|\s*Đáp án(?: đúng)?\s*\|)/imu;
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

type OptionSelection = {
  markers: OptionMarker[];
  ambiguousLabels: OptionLabel[];
};

type SharedLead = {
  content: string;
  sourceNumber: number;
  nextSubquestion: number;
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

function beforeAnswerData(value: string): string {
  const boundary = ANSWER_DATA_BOUNDARY.exec(value);
  return boundary ? value.slice(0, boundary.index) : value;
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

function selectOptionMarkers(value: string): OptionSelection {
  const candidates = optionMarkers(value);
  const selected: OptionMarker[] = [];
  const ambiguousLabels: OptionLabel[] = [];
  let after = -1;

  for (const label of OPTION_LABELS) {
    const candidatesForLabel = candidates.filter(
      (candidate) =>
        candidate.label === label && candidate.markerStart > after,
    );
    const lineStartCandidates = candidatesForLabel.filter(
      (candidate) => candidate.lineStart,
    );

    if (
      lineStartCandidates.length > 1 ||
      (lineStartCandidates.length === 0 && candidatesForLabel.length > 1)
    ) {
      ambiguousLabels.push(label);
      break;
    }

    const marker = lineStartCandidates[0] ?? candidatesForLabel[0];

    if (!marker) {
      break;
    }

    selected.push(marker);
    after = marker.markerStart;
  }

  return {
    markers:
      ambiguousLabels.length === 0 && selected.length === OPTION_LABELS.length
        ? selected
        : [],
    ambiguousLabels,
  };
}

function questionArea(segment: QuestionSegment): string {
  const answerMatch = INLINE_ANSWER.exec(segment.body);
  return answerMatch
    ? segment.body.slice(0, answerMatch.index)
    : segment.body;
}

function isChapterOneSharedLead(
  segment: QuestionSegment,
  subquestions: QuestionSegment[],
): boolean {
  if (
    segment.number !== 46 ||
    !/^Hãy đọc thông tin dưới đây và trả lời câu hỏi\s*$/iu.test(
      segment.headerText,
    ) ||
    INLINE_ANSWER.test(segment.body) ||
    subquestions.length !== 4
  ) {
    return false;
  }

  return subquestions.every((subquestion, index) => {
    const selection = selectOptionMarkers(questionArea(subquestion));
    return (
      subquestion.number === index + 1 &&
      INLINE_ANSWER.test(subquestion.body) &&
      selection.ambiguousLabels.length === 0 &&
      selection.markers.length === OPTION_LABELS.length
    );
  });
}

function parseOptions(value: string): ParsedQuestion["options"] {
  const markers = selectOptionMarkers(value).markers;

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
  const beforeAnswer = questionArea(segment);
  const markers = selectOptionMarkers(beforeAnswer).markers;

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
    beforeAnswerData(explanationWithTrailingContent),
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
  const issues: ParseIssue[] = [];
  let sharedLead: SharedLead | null = null;

  for (const [index, segment] of segments.entries()) {
    const area = questionArea(segment);
    const selection = selectOptionMarkers(area);
    const markers = selection.markers;

    if (selection.ambiguousLabels.length > 0) {
      issues.push({
        line: segment.line,
        code: "ambiguous-option-markers",
        message: `Question ${segment.number} has ambiguous inline option marker(s): ${selection.ambiguousLabels.join(", ")}.`,
      });
      sourceQuestionNumbers.add(segment.number);
      sharedLead = null;
      continue;
    }

    if (markers.length === 0) {
      if (
        isChapterOneSharedLead(
          segment,
          segments.slice(index + 1, index + 5),
        )
      ) {
        sharedLead = {
          content: normalizeMarkdown(
            `${segment.headerText}\n${beforeAnswerData(segment.body)}`,
          ),
          sourceNumber: segment.number,
          nextSubquestion: 1,
        };
        sourceQuestionNumbers.add(segment.number);
        continue;
      }

      const hasOptionMarkers = optionMarkers(area).length > 0;
      issues.push({
        line: segment.line,
        code: hasOptionMarkers
          ? "incomplete-question"
          : "optionless-question",
        message: hasOptionMarkers
          ? `Question ${segment.number} does not contain one unambiguous option for each label A–D.`
          : `Question ${segment.number} does not contain any options.`,
      });
      sharedLead = null;
      continue;
    }

    sourceQuestionNumbers.add(segment.number);
    let sourceNumber = segment.number;
    let sharedLeadContent = "";

    if (
      sharedLead &&
      sharedLead.nextSubquestion <= 4 &&
      segment.number === sharedLead.nextSubquestion
    ) {
      sourceNumber =
        sharedLead.sourceNumber + sharedLead.nextSubquestion - 1;
      sharedLeadContent = sharedLead.content;
      sharedLead.nextSubquestion += 1;

      if (sharedLead.nextSubquestion > 4) {
        sharedLead = null;
      }
    } else {
      sharedLead = null;
    }

    const question = parseQuestion(
      segment,
      sourceNumber,
      sharedLeadContent,
    );

    if (question) {
      questions.push(question);
    }
  }

  return {
    questions,
    issues: [
      ...issues,
      ...orphanAnswerIssues(normalizedSource, sourceQuestionNumbers),
    ],
  };
}
