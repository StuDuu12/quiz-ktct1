"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isE2EEnabled } from "@/src/e2e/guard";
import {
  getE2EExamReview,
  getE2EMockExamLaunch,
  loadE2EExam,
  saveE2EExamAnswer,
  saveE2EExamFlag,
  startE2EExam,
  submitE2EExam,
} from "@/src/e2e/store";
import { requireViewer } from "@/src/features/auth/session";
import { startMockExam } from "@/src/features/exam/start-attempt";
import type {
  ExamAnswer,
  ExamQuestionSnapshot,
  ExamSessionState,
  SubmitExamResult,
} from "@/src/features/exam/types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type SnapshotOption = {
  id?: unknown;
  label?: unknown;
  content?: unknown;
  is_correct?: unknown;
};

type SnapshotQuestion = {
  id?: unknown;
  content?: unknown;
  difficulty?: unknown;
  explanation?: unknown;
  options?: unknown;
};

function parseExamQuestion(
  attemptQuestionId: string,
  questionId: string,
  value: unknown,
): ExamQuestionSnapshot {
  if (typeof value !== "object" || value === null) {
    throw new Error("EXAM_SNAPSHOT_INVALID");
  }
  const snapshot = value as SnapshotQuestion;
  if (
    "explanation" in snapshot ||
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
  if (options.length !== 4) {
    throw new Error("EXAM_SNAPSHOT_INVALID");
  }
  return {
    id: questionId,
    attemptQuestionId,
    content: snapshot.content,
    difficulty: snapshot.difficulty,
    options,
  };
}

export async function getMockExamLaunch(courseSlug: string) {
  await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    const launch = getE2EMockExamLaunch(courseSlug);
    if (!launch) throw new Error("MOCK_EXAM_COURSE_NOT_FOUND");
    return launch;
  }
  const supabase = await createServerSupabaseClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, slug, title, description")
    .eq("slug", courseSlug)
    .eq("status", "published")
    .maybeSingle();
  if (courseError || !course) throw new Error("MOCK_EXAM_COURSE_NOT_FOUND");

  const { data: configs, error: configError } = await supabase
    .from("exam_configs")
    .select("id, title")
    .eq("course_id", course.id)
    .eq("kind", "mock_exam")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (configError || !configs?.[0]) {
    throw new Error("MOCK_EXAM_CONFIG_NOT_FOUND");
  }
  return {
    course,
    config: configs[0],
  };
}

export async function startMockExamForCourse(courseSlug: string) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    const attempt = startE2EExam(viewer.id);
    redirect(`/exam/${attempt.id}`);
  }
  const launch = await getMockExamLaunch(courseSlug);
  const attempt = await startMockExam(viewer.id, launch.config.id);
  redirect(`/exam/${attempt.id}`);
}

export async function loadExamSession(
  attemptId: string,
): Promise<ExamSessionState> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) return loadE2EExam(viewer.id, attemptId);
  const supabase = await createServerSupabaseClient();
  const { data: clockRows, error: clockError } = await supabase.rpc(
    "sync_mock_exam_attempt",
    { target_attempt_id: attemptId },
  );
  const attempt = clockRows?.[0];
  if (clockError || !attempt || attempt.user_id !== viewer.id) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }

  const [
    { data: course, error: courseError },
    { data: questionRows, error: questionError },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, slug, title")
      .eq("id", attempt.course_id)
      .maybeSingle(),
    supabase
      .from("attempt_questions")
      .select("id, question_id, position, question_snapshot")
      .eq("attempt_id", attemptId)
      .order("position"),
  ]);
  if (courseError || !course || questionError || !questionRows?.length) {
    throw new Error("EXAM_SESSION_LOAD_FAILED");
  }

  const questions = questionRows.map((row) =>
    parseExamQuestion(row.id, row.question_id, row.question_snapshot),
  );
  const { data: answerRows, error: answerError } = await supabase
    .from("attempt_answers")
    .select("attempt_question_id, selected_option_id, is_flagged")
    .in(
      "attempt_question_id",
      questions.map((question) => question.attemptQuestionId),
    );
  if (answerError) throw new Error("EXAM_SESSION_LOAD_FAILED");

  const questionIdByAttemptQuestion = new Map(
    questions.map((question) => [question.attemptQuestionId, question.id]),
  );
  const answers: Record<string, ExamAnswer> = {};
  for (const row of answerRows ?? []) {
    const questionId = questionIdByAttemptQuestion.get(
      row.attempt_question_id,
    );
    if (!questionId) continue;
    answers[questionId] = {
      ...(row.selected_option_id
        ? { optionId: row.selected_option_id }
        : {}),
      flagged: row.is_flagged,
    };
  }

  return {
    attemptId: attempt.id,
    courseId: course.id,
    courseSlug: course.slug,
    courseTitle: course.title,
    status: attempt.status,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    serverNow: attempt.server_now,
    submittedAt: attempt.submitted_at,
    score: attempt.score === null ? null : Number(attempt.score),
    durationSeconds: attempt.duration_seconds,
    currentQuestionId: questions[0]!.id,
    questions,
    answers,
  };
}

export async function saveExamAnswer(
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    return saveE2EExamAnswer(
      viewer.id,
      attemptId,
      attemptQuestionId,
      optionId,
    );
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_mock_exam_answer", {
    target_attempt_id: attemptId,
    target_attempt_question_id: attemptQuestionId,
    target_option_id: optionId,
  });
  if (error || !data?.[0]) throw new Error("EXAM_ANSWER_SAVE_FAILED");
  return {
    optionId: data[0].selected_option_id,
    flagged: data[0].is_flagged,
  };
}

export async function toggleFlag(
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    saveE2EExamFlag(viewer.id, attemptId, attemptQuestionId, flagged);
    return;
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_mock_exam_flag", {
    target_attempt_id: attemptId,
    target_attempt_question_id: attemptQuestionId,
    target_flagged: flagged,
  });
  if (error) throw new Error("EXAM_FLAG_SAVE_FAILED");
}

export async function loadExamReviewSnapshot(attemptId: string) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) return getE2EExamReview(viewer.id, attemptId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_mock_exam_review", {
    target_attempt_id: attemptId,
  });
  if (error || data?.length !== 40) {
    throw new Error("EXAM_REVIEW_LOAD_FAILED");
  }
  const revision = Number(data[0]!.answer_revision);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    data.some((row) => Number(row.answer_revision) !== revision)
  ) {
    throw new Error("EXAM_REVIEW_LOAD_FAILED");
  }
  const answers: Record<string, ExamAnswer> = {};
  for (const row of data) {
    answers[row.attempt_question_id] = {
      ...(row.selected_option_id
        ? { optionId: row.selected_option_id }
        : {}),
      flagged: row.is_flagged,
    };
  }
  return { revision, answers };
}

export async function submitAttempt(
  attemptId: string,
  expectedRevision?: number,
): Promise<SubmitExamResult> {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  if (isE2EEnabled()) {
    return submitE2EExam(viewer.id, attemptId, expectedRevision);
  }
  const supabase = await createServerSupabaseClient();
  const args =
    expectedRevision === undefined
      ? { target_attempt_id: attemptId }
      : {
          target_attempt_id: attemptId,
          expected_answer_revision: expectedRevision,
        };
  const { data, error } = await supabase.rpc(
    "submit_mock_exam_attempt",
    args,
  );
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    String(error.message).includes("REVIEW_STALE")
  ) {
    throw new Error("REVIEW_STALE");
  }
  if (
    error ||
    !data ||
    data.status !== "submitted" ||
    data.score === null ||
    data.submitted_at === null ||
    data.duration_seconds === null
  ) {
    throw new Error("EXAM_SUBMIT_FAILED");
  }
  revalidatePath("/dashboard");
  return {
    attemptId: data.id,
    status: "submitted",
    score: Number(data.score),
    submittedAt: data.submitted_at,
    durationSeconds: data.duration_seconds,
  };
}
