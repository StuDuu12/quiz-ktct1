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
    const attemptIds = typedAttempts
      .filter((attempt) => attempt.kind === "practice")
      .map((attempt) => attempt.id);

    const attemptProgress: ProgressAttempt[] = [];
    const latestByChapter = new Map<string, string>();

    if (attemptIds.length > 0) {
      const { data: attemptQuestions, error: questionError } = await supabase
        .from("attempt_questions")
        .select("attempt_id, questions(chapter_id), attempt_answers(is_correct)")
        .in("attempt_id", attemptIds);

      if (questionError) return { data: null, error: "Không thể tải kết quả luyện tập lúc này." };

      const counts = new Map<string, { correct: number; total: number }>();
      const byAttempt = new Map(typedAttempts.map((attempt) => [attempt.id, attempt]));
      for (const row of (attemptQuestions ?? []) as unknown as Array<{
        attempt_id: string;
        questions: { chapter_id: string } | null;
        attempt_answers: { is_correct: boolean | null } | null;
      }>) {
        const chapterId = row.questions?.chapter_id;
        const attempt = byAttempt.get(row.attempt_id);
        if (!chapterId || !attempt || attempt.kind !== "practice") continue;
        const key = `${row.attempt_id}:${chapterId}`;
        const count = counts.get(key) ?? { correct: 0, total: 0 };
        count.total += 1;
        count.correct += row.attempt_answers?.is_correct ? 1 : 0;
        counts.set(key, count);
        if (attempt.status === "submitted") {
          const occurredAt = attempt.submitted_at ?? attempt.started_at;
          const currentLatest = latestByChapter.get(chapterId);
          if (!currentLatest || new Date(occurredAt) > new Date(currentLatest)) {
            latestByChapter.set(chapterId, occurredAt);
          }
        }
      }
      for (const [key, count] of counts) {
        const attemptId = key.slice(0, key.indexOf(":"));
        const chapterId = key.slice(key.indexOf(":") + 1);
        const attempt = byAttempt.get(attemptId);
        if (attempt) attemptProgress.push({ chapterId, status: attempt.status, ...count });
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
