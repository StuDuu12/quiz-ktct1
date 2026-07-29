import type { Viewer } from "@/src/features/auth/session";
import { calculateChapterProgress, type ProgressAttempt } from "@/src/features/catalog/progress";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

export type ChapterSummary = {
  id: string;
  position: number;
  title: string;
  questionCount: number;
  attempts: number;
  accuracy: number | null;
  latestAttemptAt: string | null;
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

    const [{ data: chapters, error: chaptersError }, { data: attempts, error: attemptsError }] =
      await Promise.all([
        supabase
          .from("chapters")
          .select("id, position, title, questions(id)")
          .eq("course_id", course.id)
          .order("position"),
        supabase
          .from("attempts")
          .select("id, kind, status, score, submitted_at, started_at")
          .eq("course_id", course.id)
          .eq("user_id", viewer.id)
          .order("started_at", { ascending: false }),
      ]);

    if (chaptersError || attemptsError) {
      return { data: null, error: "Không thể tải tiến độ học tập lúc này." };
    }

    const typedChapters = (chapters ?? []) as unknown as Array<{
      id: string;
      position: number;
      title: string;
      questions: { id: string }[] | null;
    }>;
    const typedAttempts = attempts ?? [];
    const { data: submittedProgress, error: progressError } = await supabase.rpc(
      "get_submitted_practice_progress",
      { target_course_id: course.id },
    );
    if (progressError) return { data: null, error: "Không thể tải kết quả luyện tập lúc này." };

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
      };
    });
    const completed = chapterSummaries.filter((chapter) => chapter.accuracy !== null);
    const overallProgress = completed.length
      ? Math.round(completed.reduce((sum, chapter) => sum + (chapter.accuracy ?? 0), 0) / completed.length)
      : null;

    return {
      data: {
        course,
        chapters: chapterSummaries,
        recentAttempts: typedAttempts.slice(0, 5).map((attempt) => ({
          id: attempt.id,
          kind: attempt.kind,
          status: attempt.status,
          score: attempt.score,
          submittedAt: attempt.submitted_at,
          startedAt: attempt.started_at,
        })),
        overallProgress,
        questionCount: chapterSummaries.reduce((sum, chapter) => sum + chapter.questionCount, 0),
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Chưa thể kết nối với dữ liệu học tập. Vui lòng thử lại sau." };
  }
}
