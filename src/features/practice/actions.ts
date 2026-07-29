"use server";

import { revalidatePath } from "next/cache";

import { isE2EEnabled } from "@/src/e2e/guard";
import {
  finishE2EPractice,
  getE2EPracticeChapter,
  loadE2EPractice,
  loadOrStartE2EPractice,
  saveE2EPracticeAnswer,
  saveE2EPracticeFlag,
  startE2EPractice,
} from "@/src/e2e/store";
import { requireViewer } from "@/src/features/auth/session";
import type {
  PracticeAnswer,
  PracticeOption,
  PracticeQuestion,
  PracticeState,
} from "@/src/features/practice/types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type ChapterRecord = {
  id: string;
  course_id: string;
  position: number;
  title: string;
};

type CourseRecord = {
  id: string;
  slug: string;
  status: string;
};

type SnapshotRecord = {
  id?: unknown;
  content?: unknown;
  explanation?: unknown;
  options?: unknown;
};

function practiceError(message: string, cause?: unknown): Error {
  if (cause instanceof Error && cause.message.includes("ANSWER_LOCKED")) {
    return new Error("ANSWER_LOCKED");
  }
  return new Error(message);
}

function parseOptions(value: unknown): PracticeOption[] {
  if (!Array.isArray(value)) throw new Error("PRACTICE_SNAPSHOT_INVALID");
  const options = value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { id?: unknown }).id !== "string" ||
      typeof (item as { label?: unknown }).label !== "string" ||
      typeof (item as { content?: unknown }).content !== "string"
    ) {
      throw new Error("PRACTICE_SNAPSHOT_INVALID");
    }
    return {
      id: (item as { id: string }).id,
      label: (item as { label: string }).label,
      content: (item as { content: string }).content,
    };
  });
  if (options.length < 1 || options.length > 4) {
    throw new Error("PRACTICE_SNAPSHOT_INVALID");
  }
  return options;
}

function parseQuestionSnapshot(
  attemptQuestionId: string,
  questionId: string,
  value: unknown,
): PracticeQuestion {
  if (typeof value !== "object" || value === null) {
    throw new Error("PRACTICE_SNAPSHOT_INVALID");
  }
  const snapshot = value as SnapshotRecord;
  if (typeof snapshot.content !== "string") {
    throw new Error("PRACTICE_SNAPSHOT_INVALID");
  }
  return {
    id: questionId,
    attemptQuestionId,
    content: snapshot.content,
    explanation: "",
    options: parseOptions(snapshot.options),
  };
}

async function getCourse(
  courseId: string,
): Promise<CourseRecord> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, status")
    .eq("id", courseId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) throw practiceError("COURSE_NOT_FOUND", error);
  return data;
}

export async function getPracticeChapterById(
  chapterId: string,
): Promise<ChapterRecord & { course: CourseRecord }> {
  await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    const position = Number(chapterId.replace("e2e-chapter-", ""));
    const chapter = getE2EPracticeChapter(
      "kinh-te-chinh-tri-mac-lenin",
      position,
    );
    if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
    return chapter;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chapters")
    .select("id, course_id, position, title")
    .eq("id", chapterId)
    .maybeSingle();

  if (error || !data) throw practiceError("CHAPTER_NOT_FOUND", error);
  return { ...data, course: await getCourse(data.course_id) };
}

export async function getPracticeChapterByRoute(
  courseSlug: string,
  position: number,
): Promise<ChapterRecord & { course: CourseRecord }> {
  await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    const chapter = getE2EPracticeChapter(courseSlug, position);
    if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
    return chapter;
  }
  const supabase = await createServerSupabaseClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, slug, status")
    .eq("slug", courseSlug)
    .eq("status", "published")
    .maybeSingle();

  if (courseError || !course) {
    throw practiceError("COURSE_NOT_FOUND", courseError);
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id, course_id, position, title")
    .eq("course_id", course.id)
    .eq("position", position)
    .maybeSingle();

  if (chapterError || !chapter) {
    throw practiceError("CHAPTER_NOT_FOUND", chapterError);
  }
  return { ...chapter, course };
}

export async function startPractice(chapterId: string) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) return startE2EPractice(viewer.id, chapterId);
  const chapter = await getPracticeChapterById(chapterId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    target_course_id: chapter.course_id,
    target_exam_config_id: null,
    target_chapter_id: chapter.id,
  });

  if (error || !data) {
    throw practiceError("Không thể bắt đầu lượt luyện tập.", error);
  }
  return { attemptId: data.id };
}

export async function loadOrStartPracticeE2E(
  chapterId: string,
): Promise<PracticeState> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (!isE2EEnabled()) throw new Error("E2E_FIXTURE_DISABLED");
  return loadOrStartE2EPractice(viewer.id, chapterId);
}

export async function loadPracticeSession(
  chapterId: string,
  attemptId: string,
): Promise<PracticeState> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    return loadE2EPractice(viewer.id, chapterId, attemptId);
  }
  const chapter = await getPracticeChapterById(chapterId);
  const supabase = await createServerSupabaseClient();
  const { data: attempt, error: attemptError } = await supabase.rpc(
    "sync_practice_attempt",
    { target_attempt_id: attemptId },
  );

  if (
    attemptError ||
    !attempt ||
    attempt.user_id !== viewer.id ||
    attempt.course_id !== chapter.course_id ||
    attempt.kind !== "practice" ||
    !["in_progress", "submitted", "expired"].includes(attempt.status)
  ) {
    throw practiceError("PRACTICE_ATTEMPT_NOT_FOUND", attemptError);
  }

  const { data: rows, error: questionError } = await supabase.rpc(
    "load_practice_attempt_questions",
    {
      target_attempt_id: attemptId,
      target_chapter_id: chapterId,
    },
  );

  if (questionError || !rows?.length) {
    throw practiceError("Không thể tải câu hỏi luyện tập.", questionError);
  }

  const questions = rows.map((row) =>
    parseQuestionSnapshot(
      row.id,
      row.question_id,
      row.question_snapshot,
    ),
  );
  const { data: savedAnswers, error: answerError } = await supabase
    .from("attempt_answers")
    .select("attempt_question_id, selected_option_id, is_flagged")
    .in(
      "attempt_question_id",
      rows.map(({ id }) => id),
    );
  if (answerError) {
    throw practiceError("Không thể tải đáp án đã lưu.", answerError);
  }

  const byAttemptQuestion = new Map(
    (savedAnswers ?? []).map((answer) => [
      answer.attempt_question_id,
      answer,
    ]),
  );
  const answers: Record<string, PracticeAnswer> = {};

  for (const question of questions) {
    const saved = byAttemptQuestion.get(question.attemptQuestionId);
    if (!saved) continue;
    const answer: PracticeAnswer = {
      flagged: saved.is_flagged,
      locked: saved.selected_option_id !== null,
      showFeedback: saved.selected_option_id !== null,
      ...(saved.selected_option_id
        ? { optionId: saved.selected_option_id }
        : {}),
    };

    if (saved.selected_option_id && attempt.status === "in_progress") {
      const { data: feedback, error: feedbackError } = await supabase.rpc(
        "save_practice_answer",
        {
          target_attempt_id: attemptId,
          target_attempt_question_id: question.attemptQuestionId,
          target_option_id: saved.selected_option_id,
        },
      );
      if (feedbackError || !feedback?.[0]) {
        throw practiceError("Không thể tải phản hồi đáp án.", feedbackError);
      }
      answer.isCorrect = feedback[0].is_correct;
      answer.explanation = feedback[0].explanation;
      answer.optionId = feedback[0].selected_option_id;
    }
    answers[question.id] = answer;
  }

  return {
    attemptId,
    courseSlug: chapter.course.slug,
    chapterId,
    chapterPosition: chapter.position,
    chapterTitle: chapter.title,
    currentQuestionId: questions[0]!.id,
    status: attempt.status,
    score: attempt.score === null ? null : Number(attempt.score),
    questions,
    answers,
  };
}

export async function savePracticeAnswer(
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    return saveE2EPracticeAnswer(
      viewer.id,
      attemptId,
      attemptQuestionId,
      optionId,
    );
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_practice_answer", {
    target_attempt_id: attemptId,
    target_attempt_question_id: attemptQuestionId,
    target_option_id: optionId,
  });

  if (error || !data?.[0]) {
    throw practiceError("Không thể lưu đáp án. Hãy thử lại.", error);
  }
  return {
    optionId: data[0].selected_option_id,
    isCorrect: data[0].is_correct,
    explanation: data[0].explanation,
    reconciled: data[0].was_already_locked,
  };
}

export async function savePracticeFlag(
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    saveE2EPracticeFlag(
      viewer.id,
      attemptId,
      attemptQuestionId,
      flagged,
    );
    return;
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_practice_flag", {
    target_attempt_id: attemptId,
    target_attempt_question_id: attemptQuestionId,
    target_flagged: flagged,
  });
  if (error) throw practiceError("Không thể lưu cờ câu hỏi.", error);
}

export async function finishPractice(attemptId: string) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) return finishE2EPractice(viewer.id, attemptId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("finish_practice_attempt", {
    target_attempt_id: attemptId,
  });
  if (error || !data) {
    throw practiceError("Không thể hoàn thành lượt luyện tập.", error);
  }
  if (data.status === "expired") {
    return { status: "expired" as const, score: null };
  }
  if (data.status !== "submitted") {
    throw practiceError("Không thể hoàn thành lượt luyện tập.");
  }
  revalidatePath("/dashboard");
  return {
    status: "submitted" as const,
    score: Number(data.score ?? 0),
  };
}
