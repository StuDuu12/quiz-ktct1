import { requireViewer } from "@/src/features/auth/session";
import { isE2EEnabled } from "@/src/e2e/guard";
import {
  getE2EAttemptHistory,
  getE2EHistoryChapters,
} from "@/src/e2e/store";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

export type AttemptKind = "practice" | "mock_exam";
export type AttemptStatus = "in_progress" | "submitted" | "expired";
export type ScoreBand = "0-49" | "50-79" | "80-100";

export type HistoryFilters = {
  kind: AttemptKind | null;
  chapterId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  scoreMin: number | null;
  scoreMax: number | null;
  scoreBand: ScoreBand | null;
  page: number;
  pageSize: number;
};

export type HistorySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AttemptSummary = {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  kind: AttemptKind;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  durationSeconds: number | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterPosition: number | null;
  questionCount: number;
  totalCount: number;
};

export type ResultOption = {
  id: string;
  label: string;
  content: string;
};

export type ResultQuestion = {
  attemptQuestionId: string;
  position: number;
  content: string;
  options: ResultOption[];
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  isFlagged: boolean;
  isUnanswered: boolean;
  explanation: string;
};

export type AttemptResult = {
  attemptId: string;
  kind: AttemptKind;
  score: number;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  questions: ResultQuestion[];
};

export type HistoryChapter = {
  id: string;
  title: string;
  position: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCORE_BANDS: Record<ScoreBand, [number, number]> = {
  "0-49": [0, 49],
  "50-79": [50, 79],
  "80-100": [80, 100],
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDateBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(
    Date.UTC(
      year!,
      month! - 1,
      day!,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month! - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed.toISOString();
}

export function parseHistoryFilters(
  searchParams: HistorySearchParams,
): HistoryFilters {
  const rawKind = firstValue(searchParams.kind);
  const kind =
    rawKind === "practice" || rawKind === "mock_exam" ? rawKind : null;
  const rawChapter = firstValue(searchParams.chapter);
  const chapterId =
    rawChapter && UUID_PATTERN.test(rawChapter) ? rawChapter : null;
  const rawScore = firstValue(searchParams.score);
  const scoreBand =
    rawScore && rawScore in SCORE_BANDS ? (rawScore as ScoreBand) : null;
  const [scoreMin, scoreMax] = scoreBand
    ? SCORE_BANDS[scoreBand]
    : [null, null];
  const rawPage = Number(firstValue(searchParams.page));

  return {
    kind,
    chapterId,
    dateFrom: parseDateBoundary(firstValue(searchParams.from), false),
    dateTo: parseDateBoundary(firstValue(searchParams.to), true),
    scoreMin,
    scoreMax,
    scoreBand,
    page:
      Number.isSafeInteger(rawPage) && rawPage > 0
        ? rawPage
        : 1,
    pageSize: 10,
  };
}

export async function getAttemptHistory(
  userId: string,
  filters: HistoryFilters,
): Promise<AttemptSummary[]> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    return getE2EAttemptHistory(
      viewer.role === "student" ? viewer.id : userId,
    );
  }
  const supabase = await createServerSupabaseClient();
  const scopedUserId = viewer.role === "student" ? viewer.id : userId || null;
  const { data, error } = await supabase.rpc("get_attempt_history", {
    target_user_id: scopedUserId,
    filter_kind: filters.kind,
    filter_chapter_id: filters.chapterId,
    filter_started_from: filters.dateFrom,
    filter_started_to: filters.dateTo,
    filter_score_min: filters.scoreMin,
    filter_score_max: filters.scoreMax,
    page_number: filters.page,
    page_size: filters.pageSize,
  });
  if (error) throw new Error("ATTEMPT_HISTORY_LOAD_FAILED");

  return (data ?? []).map((row) => ({
    id: row.attempt_id,
    userId: row.user_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    courseSlug: row.course_slug,
    kind: row.kind,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    score: row.score === null ? null : Number(row.score),
    durationSeconds: row.duration_seconds,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    chapterPosition: row.chapter_position,
    questionCount: row.question_count,
    totalCount: Number(row.total_count),
  }));
}

function parseResultOptions(value: unknown): ResultOption[] {
  if (!Array.isArray(value)) throw new Error("ATTEMPT_RESULT_INVALID");
  const options = value.map((option) => {
    if (
      typeof option !== "object" ||
      option === null ||
      typeof (option as { id?: unknown }).id !== "string" ||
      typeof (option as { label?: unknown }).label !== "string" ||
      typeof (option as { content?: unknown }).content !== "string"
    ) {
      throw new Error("ATTEMPT_RESULT_INVALID");
    }
    return {
      id: (option as { id: string }).id,
      label: (option as { label: string }).label,
      content: (option as { content: string }).content,
    };
  });
  if (options.length === 0) throw new Error("ATTEMPT_RESULT_INVALID");
  return options;
}

function parseResultSnapshot(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { content?: unknown }).content !== "string"
  ) {
    throw new Error("ATTEMPT_RESULT_INVALID");
  }
  return {
    content: (value as { content: string }).content,
    options: parseResultOptions((value as { options?: unknown }).options),
  };
}

export async function getAttemptResult(
  attemptId: string,
): Promise<AttemptResult> {
  await requireViewer(["student", "instructor", "admin"]);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_attempt_result_details", {
    target_attempt_id: attemptId,
  });
  if (error || !data?.length) throw new Error("ATTEMPT_RESULT_NOT_FOUND");

  const first = data[0]!;
  if (
    first.score === null ||
    first.submitted_at === null ||
    first.duration_seconds === null
  ) {
    throw new Error("ATTEMPT_RESULT_INVALID");
  }

  return {
    attemptId: first.attempt_id,
    kind: first.kind,
    score: Number(first.score),
    startedAt: first.started_at,
    submittedAt: first.submitted_at,
    durationSeconds: first.duration_seconds,
    questions: data.map((row) => {
      const snapshot = parseResultSnapshot(row.question_snapshot);
      return {
        attemptQuestionId: row.attempt_question_id,
        position: row.question_position,
        content: snapshot.content,
        options: snapshot.options,
        selectedOptionId: row.selected_option_id,
        correctOptionId: row.correct_option_id,
        isCorrect: row.is_correct,
        isFlagged: row.is_flagged,
        isUnanswered: row.is_unanswered,
        explanation: row.explanation,
      };
    }),
  };
}

export async function getHistoryChapters(): Promise<HistoryChapter[]> {
  await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) return getE2EHistoryChapters();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chapters")
    .select("id, title, position")
    .order("position");
  if (error) throw new Error("HISTORY_CHAPTERS_LOAD_FAILED");
  return data ?? [];
}
