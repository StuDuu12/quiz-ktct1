import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClient,
  revalidatePath,
  requireViewer,
} = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/src/features/auth/session", () => ({ requireViewer }));
vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));
vi.mock("@/src/e2e/guard", () => ({ isE2EEnabled: () => false }));

import * as practiceActions from "@/src/features/practice/actions";

const viewer = {
  id: "00000000-0000-0000-0000-000000000021",
  role: "student",
  email: "student@example.test",
};

const course = {
  id: "10000000-0000-0000-0000-000000000021",
  slug: "kinh-te-chinh-tri-mac-lenin",
  status: "published",
};

const chapter = {
  id: "20000000-0000-0000-0000-000000000021",
  course_id: course.id,
  position: 2,
  title: "Chương 2",
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

function inQuery(data: unknown[]) {
  const query = {
    select: vi.fn(),
    in: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  return query;
}

function practiceClient(attemptId = "60000000-0000-0000-0000-000000000021") {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      id: attemptId,
      user_id: viewer.id,
      course_id: course.id,
      kind: "practice",
      status: "in_progress",
    },
    error: null,
  });
  return {
    rpc,
    from: (table: string) => {
      if (table === "courses") return singleQuery(course);
      if (table === "chapters") return singleQuery(chapter);
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("practice start actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue(viewer);
  });

  it("uses the atomic start-or-resume RPC for an explicit practice start", async () => {
    const client = practiceClient();
    createServerSupabaseClient.mockResolvedValue(client);

    await expect(practiceActions.startPractice(chapter.id)).resolves.toEqual({
      attemptId: "60000000-0000-0000-0000-000000000021",
    });
    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith("start_or_resume_practice", {
      target_course_id: course.id,
      target_chapter_id: chapter.id,
    });
  });

  it("starts or resumes once and returns the explicit attempt route", async () => {
    const client = practiceClient();
    createServerSupabaseClient.mockResolvedValue(client);

    const action = practiceActions.startOrResumePracticeForRoute;

    await expect(
      Promise.resolve().then(() => action(course.slug, chapter.position)),
    ).resolves.toBe(
      `/courses/${course.slug}/chapters/${chapter.position}/practice?attempt=60000000-0000-0000-0000-000000000021`,
    );
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  it("loads an existing practice session through read-only database operations", async () => {
    const attemptId = "60000000-0000-0000-0000-000000000022";
    const questionId = "30000000-0000-0000-0000-000000000022";
    const attemptQuestionId = "70000000-0000-0000-0000-000000000022";
    const selectedOptionId = "40000000-0000-0000-0000-000000000022";
    const attempt = {
      id: attemptId,
      user_id: viewer.id,
      course_id: course.id,
      kind: "practice",
      status: "in_progress",
      expires_at: "2099-01-01T01:00:00.000Z",
      score: null,
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "load_practice_attempt_questions") {
        return {
          data: [
            {
              id: attemptQuestionId,
              question_id: questionId,
              question_snapshot: {
                content: "Question",
                options: [
                  { id: selectedOptionId, label: "A", content: "Answer A" },
                ],
              },
            },
          ],
          error: null,
        };
      }
      if (name === "load_practice_answer_feedback") {
        return {
          data: [
            {
              attempt_question_id: attemptQuestionId,
              selected_option_id: selectedOptionId,
              is_correct: true,
              explanation: "Explanation",
            },
          ],
          error: null,
        };
      }
      throw new Error(`Mutating or unexpected RPC during GET: ${name}`);
    });
    createServerSupabaseClient.mockResolvedValue({
      rpc,
      from: (table: string) => {
        if (table === "courses") return singleQuery(course);
        if (table === "chapters") return singleQuery(chapter);
        if (table === "attempts") return singleQuery(attempt);
        if (table === "attempt_answers") {
          return inQuery([
            {
              attempt_question_id: attemptQuestionId,
              selected_option_id: selectedOptionId,
              is_flagged: false,
            },
          ]);
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });

    await expect(
      practiceActions.loadPracticeSession(chapter.id, attemptId),
    ).resolves.toMatchObject({
      attemptId,
      status: "in_progress",
      answers: {
        [questionId]: {
          optionId: selectedOptionId,
          isCorrect: true,
          explanation: "Explanation",
        },
      },
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "load_practice_attempt_questions",
      "load_practice_answer_feedback",
    ]);
  });
});

describe("practice finish action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireViewer.mockResolvedValue(viewer);
  });

  it("sends answers to the JSONB RPC as an array instead of a scalar string", async () => {
    const attemptId = "60000000-0000-0000-0000-000000000023";
    const answers = [
      {
        attemptQuestionId: "70000000-0000-0000-0000-000000000023",
        optionId: "40000000-0000-0000-0000-000000000023",
        flagged: false,
      },
    ];
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "submitted", score: 100 },
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      practiceActions.finishPractice(attemptId, 100, answers),
    ).resolves.toEqual({ status: "submitted", score: 100 });

    expect(rpc).toHaveBeenCalledWith("finish_practice_attempt", {
      target_attempt_id: attemptId,
      answers_to_save: answers,
    });
  });
});
