import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, requireViewer } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("@/src/features/auth/session", () => ({ requireViewer }));
vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

import { startMockExam } from "@/src/features/exam/start-attempt";

const viewer = {
  id: "00000000-0000-0000-0000-000000000021",
  role: "student",
  email: "student@example.test",
};

function singleQuery(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("startMockExam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue(viewer);
  });

  it("rejects a caller-supplied owner that differs from the authenticated viewer", async () => {
    createServerSupabaseClient.mockResolvedValue({});

    await expect(
      startMockExam(
        "00000000-0000-0000-0000-000000000099",
        "50000000-0000-0000-0000-000000000021",
      ),
    ).rejects.toThrow("EXAM_OWNER_MISMATCH");
  });

  it("returns the owned immutable learner snapshot created by the secure RPC", async () => {
    const config = singleQuery({
      id: "50000000-0000-0000-0000-000000000021",
      course_id: "10000000-0000-0000-0000-000000000021",
      kind: "mock_exam",
      is_active: true,
    });
    const course = singleQuery({
      id: "10000000-0000-0000-0000-000000000021",
      status: "published",
    });
    const rows = [
      {
        id: "70000000-0000-0000-0000-000000000021",
        question_id: "30000000-0000-0000-0000-000000000021",
        question_snapshot: {
          id: "30000000-0000-0000-0000-000000000021",
          chapter_id: "20000000-0000-0000-0000-000000000021",
          content: "Question",
          difficulty: 2,
          options: [
            {
              id: "40000000-0000-0000-0000-000000000021",
              label: "B",
              content: "Option B",
            },
          ],
        },
      },
    ];
    const attemptQuestions = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    attemptQuestions.select.mockReturnValue(attemptQuestions);
    attemptQuestions.eq.mockReturnValue(attemptQuestions);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "60000000-0000-0000-0000-000000000021",
        user_id: viewer.id,
        course_id: "10000000-0000-0000-0000-000000000021",
        exam_config_id: "50000000-0000-0000-0000-000000000021",
        kind: "mock_exam",
        started_at: "2026-07-29T10:00:00.000Z",
        expires_at: "2026-07-29T11:00:00.000Z",
      },
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      from: (table: string) => {
        if (table === "exam_configs") return config;
        if (table === "courses") return course;
        if (table === "attempt_questions") return attemptQuestions;
        throw new Error(`Unexpected table: ${table}`);
      },
      rpc,
    });

    await expect(
      startMockExam(
        viewer.id,
        "50000000-0000-0000-0000-000000000021",
      ),
    ).resolves.toEqual({
      id: "60000000-0000-0000-0000-000000000021",
      userId: viewer.id,
      courseId: "10000000-0000-0000-0000-000000000021",
      examConfigId: "50000000-0000-0000-0000-000000000021",
      startedAt: "2026-07-29T10:00:00.000Z",
      expiresAt: "2026-07-29T11:00:00.000Z",
      questions: [
        {
          id: "30000000-0000-0000-0000-000000000021",
          attemptQuestionId: "70000000-0000-0000-0000-000000000021",
          content: "Question",
          difficulty: 2,
          options: [
            {
              id: "40000000-0000-0000-0000-000000000021",
              label: "B",
              content: "Option B",
            },
          ],
        },
      ],
    });
  });
});
