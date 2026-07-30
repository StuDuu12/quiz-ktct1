import { requireViewer, type Viewer } from "@/src/features/auth/session";
import { isE2EEnabled } from "@/src/e2e/guard";
import {
  getE2EAdminAudits,
  getE2EAdminCatalog,
  getE2EAdminQuestions,
  getE2EAdminReport,
  getE2EAdminUsers,
} from "@/src/e2e/store";
import type { Json } from "@/src/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

export type AdminCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  coverUrl: string | null;
  createdAt: string;
};

export type AdminChapter = {
  id: string;
  courseId: string;
  position: number;
  title: string;
  status: string;
};

export type AdminImportJob = {
  id: string;
  courseId: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  createdAt: string;
};

export type AdminQuestionOption = {
  id: string;
  label: "A" | "B" | "C" | "D";
  content: string;
  isCorrect: boolean;
};

export type AdminQuestion = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  courseId: string;
  content: string;
  explanation: string;
  difficulty: number;
  status: string;
  sourceNumber: number | null;
  updatedAt: string;
  options: AdminQuestionOption[];
};

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "instructor" | "student";
  isActive: boolean;
  createdAt: string;
  assignedCourseIds: string[];
};

export type AdminAudit = {
  id: number;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Json;
  createdAt: string;
};

export type AdminReport = {
  summary: {
    activeUsers: number;
    attempts: number;
    averageScore: number | null;
    completionRate: number;
    totalUsers: number;
  };
  chapterDifficulty: Array<{
    chapterId: string | null;
    chapterTitle: string;
    answers: number;
    incorrectRate: number;
  }>;
  questionMetrics: Array<{
    questionId: string;
    questionContent: string;
    chapterId: string | null;
    chapterTitle: string | null;
    attempts: number;
    correctRate: number;
    unansweredRate: number;
    mostSelectedDistractor: string | null;
    distractorRates: Record<string, number>;
  }>;
};

export type AdminCatalog = {
  courses: AdminCourse[];
  chapters: AdminChapter[];
  importJobs: AdminImportJob[];
};

function asObject(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("ADMIN_DATA_INVALID");
  }
  return value;
}

function numberValue(value: Json | undefined, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableString(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function stringValue(value: Json | undefined) {
  if (typeof value !== "string") throw new Error("ADMIN_DATA_INVALID");
  return value;
}

async function assignedCourseIds(viewer: Viewer) {
  if (viewer.role === "admin") return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("course_instructors")
    .select("course_id")
    .eq("instructor_id", viewer.id);
  if (error) throw new Error("ADMIN_ASSIGNMENTS_LOAD_FAILED");
  return (data ?? []).map((row) => row.course_id);
}

export async function getAdminCatalog(): Promise<AdminCatalog> {
  const viewer = await requireViewer(["admin", "instructor"]);
  if (isE2EEnabled()) return getE2EAdminCatalog(viewer);
  const scope = await assignedCourseIds(viewer);
  if (scope?.length === 0) return { courses: [], chapters: [], importJobs: [] };

  const supabase = await createServerSupabaseClient();
  let courseQuery = supabase
    .from("courses")
    .select("id, slug, title, description, status, cover_url, created_at")
    .order("created_at", { ascending: false });
  let chapterQuery = supabase
    .from("chapters")
    .select("id, course_id, position, title, status")
    .order("position");
  let importQuery = supabase
    .from("import_jobs")
    .select(
      "id, course_id, file_name, status, total_rows, processed_rows, failed_rows, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(12);
  if (scope) {
    courseQuery = courseQuery.in("id", scope);
    chapterQuery = chapterQuery.in("course_id", scope);
    importQuery = importQuery.in("course_id", scope);
  }
  const [courses, chapters, imports] = await Promise.all([
    courseQuery,
    chapterQuery,
    importQuery,
  ]);
  if (courses.error || chapters.error || imports.error) {
    throw new Error("ADMIN_CATALOG_LOAD_FAILED");
  }
  return {
    courses: (courses.data ?? []).map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
      coverUrl: course.cover_url,
      createdAt: course.created_at,
    })),
    chapters: (chapters.data ?? []).map((chapter) => ({
      id: chapter.id,
      courseId: chapter.course_id,
      position: chapter.position,
      title: chapter.title,
      status: chapter.status,
    })),
    importJobs: (imports.data ?? []).map((job) => ({
      id: job.id,
      courseId: job.course_id,
      fileName: job.file_name,
      status: job.status,
      totalRows: job.total_rows,
      processedRows: job.processed_rows,
      failedRows: job.failed_rows,
      createdAt: job.created_at,
    })),
  };
}

export async function getAdminQuestions(
  courseId?: string | null,
): Promise<AdminQuestion[]> {
  const viewer = await requireViewer(["admin", "instructor"]);
  if (isE2EEnabled()) return getE2EAdminQuestions(viewer, courseId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_admin_questions", {
    target_course_id: courseId ?? null,
  });
  if (error || !Array.isArray(data)) throw new Error("ADMIN_QUESTIONS_LOAD_FAILED");

  return data.map((value) => {
    const row = asObject(value);
    const options = Array.isArray(row.options) ? row.options : [];
    return {
      id: stringValue(row.id),
      chapterId: stringValue(row.chapterId),
      chapterTitle: stringValue(row.chapterTitle),
      courseId: stringValue(row.courseId),
      content: stringValue(row.content),
      explanation: stringValue(row.explanation),
      difficulty: numberValue(row.difficulty, 2),
      status: stringValue(row.status),
      sourceNumber:
        row.sourceNumber === null ? null : numberValue(row.sourceNumber),
      updatedAt: stringValue(row.updatedAt),
      options: options.map((optionValue) => {
        const option = asObject(optionValue);
        const label = stringValue(option.label);
        if (!["A", "B", "C", "D"].includes(label)) {
          throw new Error("ADMIN_DATA_INVALID");
        }
        return {
          id: stringValue(option.id),
          label: label as "A" | "B" | "C" | "D",
          content: stringValue(option.content),
          isCorrect: option.isCorrect === true,
        };
      }),
    };
  });
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const viewer = await requireViewer(["admin"]);
  if (isE2EEnabled()) return getE2EAdminUsers(viewer);
  const supabase = await createServerSupabaseClient();
  const [profiles, assignments] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("course_instructors").select("course_id, instructor_id"),
  ]);
  if (profiles.error || assignments.error) {
    console.error("ADMIN_USERS_LOAD_FAILED details:", {
      profilesError: profiles.error,
      assignmentsError: assignments.error,
    });
    throw new Error("ADMIN_USERS_LOAD_FAILED");
  }
  const byUser = new Map<string, string[]>();
  for (const assignment of assignments.data ?? []) {
    const current = byUser.get(assignment.instructor_id) ?? [];
    current.push(assignment.course_id);
    byUser.set(assignment.instructor_id, current);
  }
  return (profiles.data ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    createdAt: profile.created_at,
    assignedCourseIds: byUser.get(profile.id) ?? [],
  }));
}

export async function getAdminReport(
  courseId?: string | null,
): Promise<AdminReport> {
  const viewer = await requireViewer(["admin", "instructor"]);
  if (isE2EEnabled()) return getE2EAdminReport(viewer);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_admin_report", {
    target_course_id: courseId ?? null,
  });
  if (error) throw new Error("ADMIN_REPORT_LOAD_FAILED");
  const root = asObject(data);
  const summary = asObject(root.summary);
  const chapters = Array.isArray(root.chapterDifficulty)
    ? root.chapterDifficulty
    : [];
  const questions = Array.isArray(root.questionMetrics)
    ? root.questionMetrics
    : [];
  return {
    summary: {
      activeUsers: numberValue(summary.activeUsers),
      attempts: numberValue(summary.attempts),
      averageScore:
        summary.averageScore === null
          ? null
          : numberValue(summary.averageScore),
      completionRate: numberValue(summary.completionRate),
      totalUsers: numberValue(summary.totalUsers),
    },
    chapterDifficulty: chapters.map((value) => {
      const row = asObject(value);
      return {
        chapterId: nullableString(row.chapterId),
        chapterTitle: stringValue(row.chapterTitle),
        answers: numberValue(row.answers),
        incorrectRate: numberValue(row.incorrectRate),
      };
    }),
    questionMetrics: questions.map((value) => {
      const row = asObject(value);
      const rates = asObject(row.distractorRates);
      return {
        questionId: stringValue(row.questionId),
        questionContent: stringValue(row.questionContent),
        chapterId: nullableString(row.chapterId),
        chapterTitle: nullableString(row.chapterTitle),
        attempts: numberValue(row.attempts),
        correctRate: numberValue(row.correctRate),
        unansweredRate: numberValue(row.unansweredRate),
        mostSelectedDistractor: nullableString(row.mostSelectedDistractor),
        distractorRates: Object.fromEntries(
          Object.entries(rates).map(([label, rate]) => [
            label,
            numberValue(rate),
          ]),
        ),
      };
    }),
  };
}

export async function getAdminAudits(limit = 40): Promise<AdminAudit[]> {
  const viewer = await requireViewer(["admin"]);
  if (isE2EEnabled()) return getE2EAdminAudits(viewer).slice(0, limit);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error("ADMIN_AUDIT_LOAD_FAILED");
  return (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}
