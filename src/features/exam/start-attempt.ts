"use server";

import { requireViewer } from "@/src/features/auth/session";
import type { AttemptSnapshot } from "@/src/features/exam/types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type SnapshotOption = {
  id?: unknown;
  label?: unknown;
  content?: unknown;
  is_correct?: unknown;
};

type QuestionSnapshot = {
  id?: unknown;
  content?: unknown;
  difficulty?: unknown;
  explanation?: unknown;
  options?: unknown;
};

function parseQuestion(
  attemptQuestionId: string,
  questionId: string,
  value: unknown,
): AttemptSnapshot["questions"][number] {
  if (typeof value !== "object" || value === null) {
    throw new Error("EXAM_SNAPSHOT_INVALID");
  }

  const snapshot = value as QuestionSnapshot;
  if (
    "explanation" in snapshot ||
    typeof snapshot.id !== "string" ||
    snapshot.id !== questionId ||
    typeof snapshot.content !== "string" ||
    typeof snapshot.difficulty !== "number" ||
    !Array.isArray(snapshot.options)
  ) {
    throw new Error("EXAM_SNAPSHOT_INVALID");
  }

  const options = snapshot.options.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("EXAM_SNAPSHOT_INVALID");
    }
    const option = value as SnapshotOption;
    if (
      "is_correct" in option ||
      typeof option.id !== "string" ||
      typeof option.label !== "string" ||
      typeof option.content !== "string"
    ) {
      throw new Error("EXAM_SNAPSHOT_INVALID");
    }
    return {
      id: option.id,
      label: option.label,
      content: option.content,
    };
  });

  return {
    id: questionId,
    attemptQuestionId,
    content: snapshot.content,
    difficulty: snapshot.difficulty,
    options,
  };
}

export async function startMockExam(
  userId: string,
  configId: string,
): Promise<AttemptSnapshot> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (viewer.id !== userId) throw new Error("EXAM_OWNER_MISMATCH");

  const supabase = await createServerSupabaseClient();
  const { data: config, error: configError } = await supabase
    .from("exam_configs")
    .select("id, course_id, kind, is_active")
    .eq("id", configId)
    .eq("kind", "mock_exam")
    .eq("is_active", true)
    .maybeSingle();
  if (
    configError ||
    !config ||
    config.kind !== "mock_exam" ||
    !config.is_active
  ) {
    throw new Error("MOCK_EXAM_CONFIG_NOT_FOUND");
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, status")
    .eq("id", config.course_id)
    .eq("status", "published")
    .maybeSingle();
  if (courseError || !course || course.status !== "published") {
    throw new Error("PUBLISHED_COURSE_NOT_FOUND");
  }

  const { data: attempt, error: attemptError } = await supabase.rpc(
    "start_attempt",
    {
      target_course_id: course.id,
      target_exam_config_id: config.id,
      target_chapter_id: null,
    },
  );
  if (
    attemptError ||
    !attempt ||
    attempt.user_id !== viewer.id ||
    attempt.course_id !== course.id ||
    attempt.exam_config_id !== config.id ||
    attempt.kind !== "mock_exam" ||
    !attempt.expires_at
  ) {
    throw new Error("MOCK_EXAM_START_FAILED");
  }

  const { data: rows, error: snapshotError } = await supabase
    .from("attempt_questions")
    .select("id, question_id, position, question_snapshot")
    .eq("attempt_id", attempt.id)
    .order("position");
  if (snapshotError || !rows?.length) {
    throw new Error("EXAM_SNAPSHOT_NOT_FOUND");
  }

  return {
    id: attempt.id,
    userId: viewer.id,
    courseId: course.id,
    examConfigId: config.id,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    questions: rows.map((row) =>
      parseQuestion(row.id, row.question_id, row.question_snapshot),
    ),
  };
}
