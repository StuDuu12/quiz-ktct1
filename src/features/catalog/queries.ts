import type { Viewer } from "@/src/features/auth/session";
import { calculateChapterProgress, type ProgressAttempt } from "@/src/features/catalog/progress";
import { isE2EEnabled } from "@/src/e2e/guard";
import { getE2ECourseDashboard } from "@/src/e2e/store";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

export type ChapterSummary = {
  id: string;
  position: number;
  title: string;
  questionCount: number;
  attempts: number;
  accuracy: number | null;
  latestAttemptAt: string | null;
  activeAttemptId: string | null;
  history: Array<{ id: string; score: number | null; submittedAt: string; status: "submitted" | "in_progress" | "expired" }>;
};

export type RecentAttempt = {
  id: string;
  kind: "practice" | "mock_exam";
  status: "submitted" | "in_progress" | "expired";
  score: number | null;
  submittedAt: string | null;
  startedAt: string;
};

export type CourseDashboard = {
  course: { id: string; slug: string; title: string; description: string };
  chapters: ChapterSummary[];
  recentAttempts: RecentAttempt[];
  overallProgress: number | null;
  questionCount: number;
  mockExamAvailable: boolean;
};

type DashboardResult = { data: CourseDashboard | null; error: string | null };

/**
 * Reads only records protected by the active Supabase session.  This keeps the
 * dashboard honest: absent data stays empty rather than becoming a demo score.
 */
export async function getCourseDashboard(
  viewer: Viewer,
  courseSlug: string,
): Promise<DashboardResult> {
  if (isE2EEnabled()) {
    return {
      data: getE2ECourseDashboard(courseSlug),
      error: null,
    };
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, slug, title, description")
      .eq("slug", courseSlug)
      .eq("status", "published")
      .maybeSingle();

    if (courseError) return { data: null, error: "Không thể tải học phần lúc này." };
    if (!course) return { data: null, error: null };

    // Run ALL queries in parallel — no sequential waits
    const [
      { data: chapters, error: chaptersError },
      { data: chapterSummaryRows, error: summaryError },
      { data: submittedProgress, error: progressError },
      { data: recentAttempts, error: recentError },
      { data: mockExamConfigs, error: mockExamConfigError },
    ] =
      await Promise.all([
        supabase
          .from("chapters")
          .select("id, position, title, questions(id)")
          .eq("course_id", course.id)
          .order("position"),
        // @ts-expect-error generated types may not include new RPC yet
        supabase.rpc("get_dashboard_chapter_summaries", {
          target_course_id: course.id,
        }),
        supabase.rpc("get_submitted_practice_progress", {
          target_course_id: course.id,
        }),
        supabase
          .from("attempts")
          .select("id, kind, status, score, submitted_at, started_at")
          .eq("course_id", course.id)
          .eq("user_id", viewer.id)
          .order("started_at", { ascending: false })
          .limit(5),
        supabase
          .from("exam_configs")
          .select("id, question_count, duration_seconds")
          .eq("course_id", course.id)
          .eq("kind", "mock_exam")
          .eq("is_active", true)
          .limit(2),
      ]);

    if (chaptersError || summaryError || progressError || recentError || mockExamConfigError) {
      return { data: null, error: "Không thể tải tiến độ học tập lúc này." };
    }

    const typedChapters = (chapters ?? []) as unknown as Array<{
      id: string;
      position: number;
      title: string;
      questions: { id: string }[] | null;
    }>;

    // Build chapter attempt data from the lightweight RPC
    const summaryRows = ((chapterSummaryRows ?? []) as unknown) as Array<{
      chapter_id: string;
      active_attempt_id: string | null;
      attempt_id: string;
      attempt_score: number | null;
      attempt_status: "submitted" | "in_progress" | "expired";
      attempt_submitted_at: string | null;
      attempt_started_at: string;
    }>;

    const activeAttemptByChapter = new Map<string, string>();
    const historyByChapter = new Map<string, Array<{ id: string; score: number | null; submittedAt: string; status: "submitted" | "in_progress" | "expired" }>>();
    for (const row of summaryRows) {
      if (row.active_attempt_id && !activeAttemptByChapter.has(row.chapter_id)) {
        activeAttemptByChapter.set(row.chapter_id, row.active_attempt_id);
      }
      let history = historyByChapter.get(row.chapter_id);
      if (!history) {
        history = [];
        historyByChapter.set(row.chapter_id, history);
      }
      history.push({
        id: row.attempt_id,
        score: row.attempt_score,
        submittedAt: row.attempt_submitted_at ?? row.attempt_started_at,
        status: row.attempt_status,
      });
    }

    const attemptProgress: ProgressAttempt[] = (submittedProgress ?? []).map((row) => ({
      chapterId: row.chapter_id,
      status: "submitted",
      correct: row.correct_count,
      total: row.total_count,
    }));
    const latestByChapter = new Map<string, string>();
    for (const row of submittedProgress ?? []) {
      const currentLatest = latestByChapter.get(row.chapter_id);
      if (!currentLatest || new Date(row.submitted_at) > new Date(currentLatest)) {
        latestByChapter.set(row.chapter_id, row.submitted_at);
      }
    }

    const chapterSummaries = typedChapters.map((chapter) => {
      const progress = calculateChapterProgress(attemptProgress, chapter.id);
      return {
        id: chapter.id,
        position: chapter.position,
        title: chapter.title,
        questionCount: chapter.questions?.length ?? 0,
        ...progress,
        latestAttemptAt: latestByChapter.get(chapter.id) ?? null,
        activeAttemptId: activeAttemptByChapter.get(chapter.id) ?? null,
        history: historyByChapter.get(chapter.id) ?? [],
      };
    });
    const completed = chapterSummaries.filter((chapter) => chapter.accuracy !== null);
    const overallProgress = completed.length
      ? Math.round(completed.reduce((sum, chapter) => sum + (chapter.accuracy ?? 0), 0) / completed.length)
      : null;

    const typedRecent = (recentAttempts ?? []) as Array<{
      id: string;
      kind: "practice" | "mock_exam";
      status: "submitted" | "in_progress" | "expired";
      score: number | null;
      submitted_at: string | null;
      started_at: string;
    }>;

    return {
      data: {
        course,
        chapters: chapterSummaries,
        recentAttempts: typedRecent.map((attempt) => ({
          id: attempt.id,
          kind: attempt.kind,
          status: attempt.status,
          score: attempt.score,
          submittedAt: attempt.submitted_at,
          startedAt: attempt.started_at,
        })),
        overallProgress,
        questionCount: chapterSummaries.reduce((sum, chapter) => sum + chapter.questionCount, 0),
        mockExamAvailable:
          mockExamConfigs?.length === 1 &&
          mockExamConfigs[0]?.question_count === 40 &&
          mockExamConfigs[0]?.duration_seconds === 3_600,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Chưa thể kết nối với dữ liệu học tập. Vui lòng thử lại sau." };
  }
}
