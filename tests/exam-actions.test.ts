import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, requireViewer, revalidatePath } =
  vi.hoisted(() => ({
    createServerSupabaseClient: vi.fn(),
    requireViewer: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@/src/features/auth/session", () => ({ requireViewer }));
vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  loadExamSession,
  saveExamAnswer,
  submitAttempt,
  toggleFlag,
} from "@/src/features/exam/actions";

const viewer = {
  id: "00000000-0000-0000-0000-000000000021",
  role: "student",
  email: "student@example.test",
};

describe("exam actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue(viewer);
  });

  it("loads server clock, immutable snapshots, and saved answers for the owner", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "attempt-1",
          user_id: viewer.id,
          course_id: "course-1",
          status: "in_progress",
          started_at: "2026-07-29T10:00:00.000Z",
          expires_at: "2026-07-29T11:00:00.000Z",
          submitted_at: null,
          score: null,
          duration_seconds: null,
          server_now: "2026-07-29T10:30:00.000Z",
        },
      ],
      error: null,
    });
    const courseQuery = chainSingle({
      id: "course-1",
      slug: "kinh-te-chinh-tri-mac-lenin",
      title: "Kinh tế chính trị Mác – Lênin",
    });
    const questions = chainOrder([
      {
        id: "aq1",
        question_id: "q1",
        position: 1,
        question_snapshot: {
          id: "q1",
          content: "Câu hỏi?",
          difficulty: 2,
          options: [
            { id: "o1", label: "A", content: "Phương án A" },
            { id: "o2", label: "B", content: "Phương án B" },
            { id: "o3", label: "C", content: "Phương án C" },
            { id: "o4", label: "D", content: "Phương án D" },
          ],
        },
      },
    ]);
    const answers = chainIn([
      {
        attempt_question_id: "aq1",
        selected_option_id: "o2",
        is_flagged: true,
      },
    ]);
    createServerSupabaseClient.mockResolvedValue({
      rpc,
      from: (table: string) => {
        if (table === "courses") return courseQuery;
        if (table === "attempt_questions") return questions;
        if (table === "attempt_answers") return answers;
        throw new Error(`Unexpected table ${table}`);
      },
    });

    await expect(loadExamSession("attempt-1")).resolves.toMatchObject({
      attemptId: "attempt-1",
      courseSlug: "kinh-te-chinh-tri-mac-lenin",
      status: "in_progress",
      expiresAt: "2026-07-29T11:00:00.000Z",
      serverNow: "2026-07-29T10:30:00.000Z",
      questions: [
        {
          id: "q1",
          attemptQuestionId: "aq1",
          options: [{ id: "o1" }, { id: "o2" }, { id: "o3" }, { id: "o4" }],
        },
      ],
      answers: { q1: { optionId: "o2", flagged: true } },
    });
    expect(rpc).toHaveBeenCalledWith("sync_mock_exam_attempt", {
      target_attempt_id: "attempt-1",
    });
  });

  it("saves a changed answer through the guarded mock-exam RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ selected_option_id: "option-2", is_flagged: true }],
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      saveExamAnswer("attempt-1", "aq-1", "option-2"),
    ).resolves.toEqual({ optionId: "option-2", flagged: true });
    expect(rpc).toHaveBeenCalledWith("save_mock_exam_answer", {
      target_attempt_id: "attempt-1",
      target_attempt_question_id: "aq-1",
      target_option_id: "option-2",
    });
  });

  it("persists a flag through the guarded mock-exam RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      toggleFlag("attempt-1", "aq-1", true),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("set_mock_exam_flag", {
      target_attempt_id: "attempt-1",
      target_attempt_question_id: "aq-1",
      target_flagged: true,
    });
  });

  it("returns the canonical submitted result from repeated submissions", async () => {
    const canonical = {
      id: "attempt-1",
      status: "submitted",
      score: 82.5,
      submitted_at: "2026-07-29T10:42:00.000Z",
      duration_seconds: 2520,
    };
    const rpc = vi.fn().mockResolvedValue({ data: canonical, error: null });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    const first = await submitAttempt("attempt-1");
    const repeated = await submitAttempt("attempt-1");

    expect(repeated).toEqual(first);
    expect(first).toEqual({
      attemptId: "attempt-1",
      status: "submitted",
      score: 82.5,
      submittedAt: "2026-07-29T10:42:00.000Z",
      durationSeconds: 2520,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "submit_mock_exam_attempt", {
      target_attempt_id: "attempt-1",
    });
  });

  it("reports persistence failures instead of pretending a save succeeded", async () => {
    createServerSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: new Error("network unavailable"),
      }),
    });

    await expect(
      saveExamAnswer("attempt-1", "aq-1", "option-1"),
    ).rejects.toThrow("EXAM_ANSWER_SAVE_FAILED");
    await expect(submitAttempt("attempt-1")).rejects.toThrow(
      "EXAM_SUBMIT_FAILED",
    );
  });
});

function chainSingle(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function chainOrder(data: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function chainIn(data: unknown[]) {
  const query = {
    select: vi.fn(),
    in: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  return query;
}
