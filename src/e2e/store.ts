import "server-only";

import type { AppRole } from "@/src/features/auth/roles";
import type { Viewer } from "@/src/features/auth/session";
import type { CourseDashboard } from "@/src/features/catalog/queries";
import type {
  ExamAnswer,
  ExamQuestionSnapshot,
  ExamSessionState,
  SubmitExamResult,
} from "@/src/features/exam/types";
import type {
  PracticeAnswer,
  PracticeQuestion,
  PracticeState,
} from "@/src/features/practice/types";
import { assertE2EEnabled } from "@/src/e2e/guard";

export const E2E_SESSION_COOKIE = "ktct-e2e-session";
export const E2E_COURSE_SLUG = "kinh-te-chinh-tri-mac-lenin";

type E2EUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  confirmed: boolean;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
  assignedCourseIds: string[];
};

type E2EStore = {
  users: Map<string, E2EUser>;
  practiceAttempts: Map<string, E2EPracticeAttempt>;
  examAttempts: Map<string, E2EExamAttempt>;
  questions: Map<string, E2EQuestion>;
  audits: E2EAudit[];
  sequence: number;
};

type E2EQuestion = {
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
  options: Array<{
    id: string;
    label: "A" | "B" | "C" | "D";
    content: string;
    isCorrect: boolean;
  }>;
};

type E2EAudit = {
  id: number;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, string | boolean>;
  createdAt: string;
};

type E2EPracticeAttempt = {
  id: string;
  userId: string;
  chapterId: string;
  startedAt: string;
  state: PracticeState;
};

type E2EExamAttempt = {
  userId: string;
  state: ExamSessionState;
  revision: number;
};

declare global {
  var __ktctE2EStore: E2EStore | undefined;
}

function store() {
  assertE2EEnabled();
  globalThis.__ktctE2EStore ??= createStore();
  return globalThis.__ktctE2EStore;
}

function createStore(): E2EStore {
  const users = new Map<string, E2EUser>();
  for (const user of [
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "student@example.test",
      password: "Student!2026",
      fullName: "Học viên E2E",
      confirmed: true,
      role: "student" as const,
      isActive: true,
      createdAt: "2026-07-29T00:00:00.000Z",
      assignedCourseIds: [],
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      email: "instructor@example.test",
      password: "Instructor!2026",
      fullName: "Giảng viên E2E",
      confirmed: true,
      role: "instructor" as const,
      isActive: true,
      createdAt: "2026-07-29T00:00:00.000Z",
      assignedCourseIds: ["e2e-course-ktct"],
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      email: "admin@example.test",
      password: "Admin!2026",
      fullName: "Quản trị viên E2E",
      confirmed: true,
      role: "admin" as const,
      isActive: true,
      createdAt: "2026-07-29T00:00:00.000Z",
      assignedCourseIds: [],
    },
  ]) {
    users.set(user.email, user);
  }
  const questions = new Map<string, E2EQuestion>();
  questions.set("e2e-question-draft-1", {
    id: "e2e-question-draft-1",
    chapterId: "e2e-chapter-1",
    chapterTitle: "Chương 1",
    courseId: "e2e-course-ktct",
    content: "Câu hỏi bản nháp được phân công",
    explanation: "",
    difficulty: 2,
    status: "draft",
    sourceNumber: 501,
    updatedAt: "2026-07-29T00:00:00.000Z",
    options: ["A", "B", "C", "D"].map((label, index) => ({
      id: `e2e-question-draft-1-${label.toLowerCase()}`,
      label: label as "A" | "B" | "C" | "D",
      content: `Phương án ${label}`,
      isCorrect: index === 0,
    })),
  });
  return {
    users,
    practiceAttempts: new Map(),
    examAttempts: new Map(),
    questions,
    audits: [],
    sequence: 0,
  };
}

export function resetE2EStore() {
  assertE2EEnabled();
  globalThis.__ktctE2EStore = createStore();
}

export function registerE2EStudent(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  assertE2EEnabled();
  const email = input.email.trim().toLowerCase();
  if (store().users.has(email)) {
    return { error: "Email đã được đăng ký." };
  }
  const user: E2EUser = {
    id: `e2e-${email}`,
    email,
    password: input.password,
    fullName: input.fullName.trim(),
    confirmed: false,
    role: "student",
    isActive: true,
    createdAt: new Date().toISOString(),
    assignedCourseIds: [],
  };
  store().users.set(email, user);
  return { error: null };
}

export function confirmE2EEmail(email: string) {
  assertE2EEnabled();
  const user = store().users.get(email.trim().toLowerCase());
  if (!user) return false;
  user.confirmed = true;
  return true;
}

export function authenticateE2EUser(email: string, password: string) {
  assertE2EEnabled();
  const user = store().users.get(email.trim().toLowerCase());
  if (!user || user.password !== password) {
    return { user: null, error: "Invalid login credentials" };
  }
  if (!user.confirmed) {
    return { user: null, error: "Email not confirmed" };
  }
  if (!user.isActive) {
    return { user: null, error: "Account is inactive" };
  }
  return { user, error: null };
}

export function getE2EViewer(sessionId: string | undefined): Viewer | null {
  assertE2EEnabled();
  if (!sessionId) return null;
  const user = [...store().users.values()].find(
    (candidate) => candidate.id === sessionId,
  );
  return user?.isActive
    ? { id: user.id, role: user.role, email: user.email }
    : null;
}

export function getE2ECourseDashboard(
  courseSlug: string,
): CourseDashboard | null {
  assertE2EEnabled();
  if (courseSlug !== E2E_COURSE_SLUG) return null;
  const chapters = Array.from({ length: 6 }, (_, index) => ({
    id: `e2e-chapter-${index + 1}`,
    position: index + 1,
    title: `Chương ${index + 1}`,
    questionCount: index === 0 ? 10 : 8,
    attempts: 0,
    accuracy: null,
    latestAttemptAt: null,
    activeAttemptId: null,
  }));
  return {
    course: {
      id: "e2e-course-ktct",
      slug: E2E_COURSE_SLUG,
      title: "Kinh tế chính trị Mác – Lênin",
      description: "Học phần E2E dùng để kiểm tra các luồng giao diện thực.",
    },
    chapters,
    recentAttempts: [],
    overallProgress: null,
    questionCount: chapters.reduce(
      (total, chapter) => total + chapter.questionCount,
      0,
    ),
    mockExamAvailable: true,
  };
}

export function getE2EPracticeChapter(courseSlug: string, position: number) {
  assertE2EEnabled();
  if (courseSlug !== E2E_COURSE_SLUG || position < 1 || position > 6) {
    return null;
  }
  return {
    id: `e2e-chapter-${position}`,
    course_id: "e2e-course-ktct",
    position,
    title: `Chương ${position}`,
    course: {
      id: "e2e-course-ktct",
      slug: E2E_COURSE_SLUG,
      status: "published",
    },
  };
}

function practiceQuestions(): PracticeQuestion[] {
  return Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    return {
      id: `e2e-practice-q-${number}`,
      attemptQuestionId: `e2e-practice-aq-${number}`,
      content:
        number === 1
          ? "Giá trị hàng hóa do yếu tố nào quyết định?"
          : `Câu hỏi luyện tập số ${number}`,
      explanation: "",
      options: ["A", "B", "C", "D"].map((label, optionIndex) => ({
        id: `e2e-practice-q-${number}-${label.toLowerCase()}`,
        label,
        content:
          number === 1 && optionIndex === 1
            ? "Lao động xã hội cần thiết"
            : `Phương án ${label} của câu ${number}`,
      })),
    };
  });
}

export function startE2EPractice(userId: string, chapterId: string) {
  assertE2EEnabled();
  const position = Number(chapterId.replace("e2e-chapter-", ""));
  const chapter = getE2EPracticeChapter(E2E_COURSE_SLUG, position);
  if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
  const fixture = store();
  const id = `e2e-practice-${++fixture.sequence}`;
  const questions = practiceQuestions();
  const state: PracticeState = {
    attemptId: id,
    courseSlug: E2E_COURSE_SLUG,
    chapterId,
    chapterPosition: position,
    chapterTitle: chapter.title,
    currentQuestionId: questions[0]!.id,
    status: "in_progress",
    questions,
    answers: {},
  };
  fixture.practiceAttempts.set(id, {
    id,
    userId,
    chapterId,
    startedAt: new Date().toISOString(),
    state,
  });
  return { attemptId: id };
}

export function loadOrStartE2EPractice(
  userId: string,
  chapterId: string,
) {
  assertE2EEnabled();
  const existing = [...store().practiceAttempts.values()].find(
    (attempt) =>
      attempt.userId === userId &&
      attempt.chapterId === chapterId &&
      attempt.state.status === "in_progress",
  );
  const attemptId =
    existing?.id ?? startE2EPractice(userId, chapterId).attemptId;
  return loadE2EPractice(userId, chapterId, attemptId);
}

export function loadE2EPractice(
  userId: string,
  chapterId: string,
  attemptId: string,
) {
  assertE2EEnabled();
  const attempt = store().practiceAttempts.get(attemptId);
  if (
    !attempt ||
    attempt.userId !== userId ||
    attempt.chapterId !== chapterId
  ) {
    throw new Error("PRACTICE_ATTEMPT_NOT_FOUND");
  }
  return structuredClone(attempt.state);
}

export function saveE2EPracticeAnswer(
  userId: string,
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) {
  assertE2EEnabled();
  const attempt = store().practiceAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("PRACTICE_ATTEMPT_NOT_FOUND");
  }
  const question = attempt.state.questions.find(
    (candidate) => candidate.attemptQuestionId === attemptQuestionId,
  );
  if (!question) throw new Error("PRACTICE_QUESTION_NOT_FOUND");
  const existing = attempt.state.answers[question.id];
  if (existing?.locked) {
    return {
      optionId: existing.optionId!,
      isCorrect: Boolean(existing.isCorrect),
      explanation: existing.explanation ?? "",
      reconciled: true,
    };
  }
  const correctOptionId = `${question.id}-b`;
  const isCorrect = optionId === correctOptionId;
  const explanation =
    "Giá trị hàng hóa được quyết định bởi thời gian lao động xã hội cần thiết.";
  const answer: PracticeAnswer = {
    optionId,
    flagged: Boolean(existing?.flagged),
    locked: true,
    showFeedback: true,
    isCorrect,
    explanation,
  };
  attempt.state.answers[question.id] = answer;
  return { optionId, isCorrect, explanation, reconciled: false };
}

export function saveE2EPracticeFlag(
  userId: string,
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) {
  assertE2EEnabled();
  const attempt = store().practiceAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("PRACTICE_ATTEMPT_NOT_FOUND");
  }
  const question = attempt.state.questions.find(
    (candidate) => candidate.attemptQuestionId === attemptQuestionId,
  );
  if (!question) throw new Error("PRACTICE_QUESTION_NOT_FOUND");
  const existing = attempt.state.answers[question.id];
  attempt.state.answers[question.id] = {
    optionId: existing?.optionId,
    flagged,
    locked: existing?.locked ?? false,
    showFeedback: existing?.showFeedback ?? false,
    isCorrect: existing?.isCorrect,
    explanation: existing?.explanation,
  };
}

export function finishE2EPractice(userId: string, attemptId: string) {
  assertE2EEnabled();
  const attempt = store().practiceAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("PRACTICE_ATTEMPT_NOT_FOUND");
  }
  const correct = Object.values(attempt.state.answers).filter(
    (answer) => answer.isCorrect,
  ).length;
  const score = (correct / attempt.state.questions.length) * 100;
  attempt.state.status = "submitted";
  attempt.state.score = score;
  return { status: "submitted" as const, score };
}

export function getE2EAttemptHistory(userId: string) {
  assertE2EEnabled();
  const practice = [...store().practiceAttempts.values()]
    .filter((attempt) => attempt.userId === userId)
    .map((attempt) => ({
      id: attempt.id,
      userId,
      courseId: "e2e-course-ktct",
      courseTitle: "Kinh tế chính trị Mác – Lênin",
      kind: "practice" as const,
      status: attempt.state.status,
      startedAt: attempt.startedAt,
      submittedAt:
        attempt.state.status === "submitted" ? attempt.startedAt : null,
      score: attempt.state.score ?? null,
      durationSeconds: attempt.state.status === "submitted" ? 0 : null,
      chapterId: attempt.chapterId,
      chapterTitle: attempt.state.chapterTitle,
      questionCount: attempt.state.questions.length,
      totalCount: 0,
    }));
  const exams = [...store().examAttempts.entries()]
    .filter(([, attempt]) => attempt.userId === userId)
    .map(([id, attempt]) => ({
      id,
      userId,
      courseId: attempt.state.courseId,
      courseTitle: attempt.state.courseTitle,
      kind: "mock_exam" as const,
      status: attempt.state.status,
      startedAt: attempt.state.startedAt,
      submittedAt: attempt.state.submittedAt,
      score: attempt.state.score,
      durationSeconds: attempt.state.durationSeconds,
      chapterId: null,
      chapterTitle: null,
      questionCount: attempt.state.questions.length,
      totalCount: 0,
    }));
  const attempts = [...practice, ...exams].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
  return attempts.map((attempt) => ({
    ...attempt,
    totalCount: attempts.length,
  }));
}

export function getE2EHistoryChapters() {
  assertE2EEnabled();
  return Array.from({ length: 6 }, (_, index) => ({
    id: `e2e-chapter-${index + 1}`,
    title: `Chương ${index + 1}`,
    position: index + 1,
  }));
}

function examQuestions(): ExamQuestionSnapshot[] {
  return Array.from({ length: 40 }, (_, index) => {
    const number = index + 1;
    return {
      id: `e2e-exam-q-${number}`,
      attemptQuestionId: `e2e-exam-aq-${number}`,
      content: `Câu hỏi thi thử số ${number}`,
      difficulty: 2,
      options: ["A", "B", "C", "D"].map((label) => ({
        id: `e2e-exam-q-${number}-${label.toLowerCase()}`,
        label,
        content: `Phương án ${label} của câu ${number}`,
      })),
    };
  });
}

export function getE2EMockExamLaunch(courseSlug: string) {
  assertE2EEnabled();
  if (courseSlug !== E2E_COURSE_SLUG) return null;
  return {
    course: {
      id: "e2e-course-ktct",
      slug: E2E_COURSE_SLUG,
      title: "Kinh tế chính trị Mác – Lênin",
      description: "Đề thi thử E2E theo đúng giao diện người học.",
    },
    config: { id: "e2e-mock-config", title: "Thi thử tổng hợp" },
  };
}

export function startE2EExam(userId: string) {
  assertE2EEnabled();
  const fixture = store();
  const id = `e2e-exam-${++fixture.sequence}`;
  const now = new Date();
  const questions = examQuestions();
  const state: ExamSessionState = {
    attemptId: id,
    courseId: "e2e-course-ktct",
    courseSlug: E2E_COURSE_SLUG,
    courseTitle: "Kinh tế chính trị Mác – Lênin",
    status: "in_progress",
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
    serverNow: now.toISOString(),
    submittedAt: null,
    score: null,
    durationSeconds: null,
    currentQuestionId: questions[0]!.id,
    questions,
    answers: {},
  };
  fixture.examAttempts.set(id, { userId, state, revision: 0 });
  return { id };
}

export function loadE2EExam(userId: string, attemptId: string) {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }
  attempt.state.serverNow = new Date().toISOString();
  return structuredClone(attempt.state);
}

function findExamQuestion(
  attempt: E2EExamAttempt,
  attemptQuestionId: string,
) {
  const question = attempt.state.questions.find(
    (candidate) => candidate.attemptQuestionId === attemptQuestionId,
  );
  if (!question) throw new Error("EXAM_QUESTION_NOT_FOUND");
  return question;
}

export function saveE2EExamAnswer(
  userId: string,
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }
  const question = findExamQuestion(attempt, attemptQuestionId);
  const answer = attempt.state.answers[question.id] ?? { flagged: false };
  attempt.state.answers[question.id] = { ...answer, optionId };
  attempt.revision += 1;
  return {
    optionId,
    flagged: Boolean(attempt.state.answers[question.id]?.flagged),
  };
}

export function saveE2EExamFlag(
  userId: string,
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }
  const question = findExamQuestion(attempt, attemptQuestionId);
  attempt.state.answers[question.id] = {
    ...attempt.state.answers[question.id],
    flagged,
  };
  attempt.revision += 1;
}

export function getE2EExamReview(userId: string, attemptId: string) {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }
  const answers: Record<string, ExamAnswer> = {};
  for (const question of attempt.state.questions) {
    answers[question.attemptQuestionId] = structuredClone(
      attempt.state.answers[question.id] ?? { flagged: false },
    );
  }
  return { revision: attempt.revision, answers };
}

export function submitE2EExam(
  userId: string,
  attemptId: string,
  expectedRevision?: number,
): SubmitExamResult {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new Error("EXAM_ATTEMPT_NOT_FOUND");
  }
  if (
    expectedRevision !== undefined &&
    expectedRevision !== attempt.revision
  ) {
    throw new Error("REVIEW_STALE");
  }
  if (attempt.state.status !== "submitted") {
    const now = new Date();
    attempt.state.status = "submitted";
    attempt.state.submittedAt = now.toISOString();
    attempt.state.durationSeconds = Math.max(
      0,
      Math.round(
        (now.getTime() - Date.parse(attempt.state.startedAt)) / 1_000,
      ),
    );
    attempt.state.score =
      Object.keys(attempt.state.answers).length /
      attempt.state.questions.length *
      100;
  }
  return {
    attemptId,
    status: "submitted",
    score: attempt.state.score ?? 0,
    submittedAt: attempt.state.submittedAt!,
    durationSeconds: attempt.state.durationSeconds!,
  };
}

export function expireE2EExam(attemptId: string) {
  assertE2EEnabled();
  const attempt = store().examAttempts.get(attemptId);
  if (!attempt) return false;
  attempt.state.expiresAt = new Date(Date.now() - 1_000).toISOString();
  return true;
}

export function getE2EAdminCatalog(viewer: Viewer) {
  assertE2EEnabled();
  const user = [...store().users.values()].find(
    (candidate) => candidate.id === viewer.id,
  );
  const assigned =
    viewer.role === "admin"
      ? ["e2e-course-ktct"]
      : user?.assignedCourseIds ?? [];
  const courses = assigned.includes("e2e-course-ktct")
    ? [
        {
          id: "e2e-course-ktct",
          slug: E2E_COURSE_SLUG,
          title: "Kinh tế chính trị Mác – Lênin",
          description: "Khóa học được phân công cho giảng viên E2E.",
          status: "published",
          coverUrl: null,
          createdAt: "2026-07-29T00:00:00.000Z",
        },
      ]
    : [];
  return {
    courses,
    chapters: courses.length
      ? Array.from({ length: 6 }, (_, index) => ({
          id: `e2e-chapter-${index + 1}`,
          courseId: "e2e-course-ktct",
          position: index + 1,
          title: `Chương ${index + 1}`,
          status: "published",
        }))
      : [],
    importJobs: [],
  };
}

export function getE2EAdminQuestions(
  viewer: Viewer,
  courseId?: string | null,
) {
  assertE2EEnabled();
  const targetCourseId = courseId ?? "e2e-course-ktct";
  const actor = [...store().users.values()].find(
    (candidate) => candidate.id === viewer.id,
  );
  const allowed =
    viewer.role === "admin" ||
    (viewer.role === "instructor" &&
      actor?.assignedCourseIds.includes(targetCourseId));
  if (!allowed) throw new Error("FORBIDDEN");
  return [...store().questions.values()]
    .filter((question) => question.courseId === targetCourseId)
    .map((question) => structuredClone(question));
}

export function saveE2EQuestion(
  viewer: Viewer,
  input: {
    id: string | null;
    chapterId: string;
    content: string;
    explanation: string;
    difficulty: number;
    status: string;
    sourceNumber: number | null;
    options: Array<{
      label: "A" | "B" | "C" | "D";
      content: string;
      isCorrect: boolean;
    }>;
  },
) {
  assertE2EEnabled();
  const courseId = input.chapterId.startsWith("e2e-unassigned")
    ? "e2e-course-unassigned"
    : "e2e-course-ktct";
  getE2EAdminQuestions(viewer, courseId);
  const id = input.id ?? `e2e-question-${++store().sequence}`;
  store().questions.set(id, {
    id,
    chapterId: input.chapterId,
    chapterTitle: input.chapterId.startsWith("e2e-unassigned")
      ? "Ngoài phân công"
      : "Chương 1",
    courseId,
    content: input.content,
    explanation: input.explanation,
    difficulty: input.difficulty,
    status: input.status,
    sourceNumber: input.sourceNumber,
    updatedAt: new Date().toISOString(),
    options: input.options.map((option) => ({
      id: `${id}-${option.label.toLowerCase()}`,
      ...option,
    })),
  });
  return id;
}

export function deleteE2EQuestion(viewer: Viewer, questionId: string) {
  assertE2EEnabled();
  const question = store().questions.get(questionId);
  if (question) {
    getE2EAdminQuestions(viewer, question.courseId);
    store().questions.delete(questionId);
  }
}

function requireE2EAdmin(viewer: Viewer) {
  if (viewer.role !== "admin") throw new Error("FORBIDDEN");
}

function pushE2EAudit(
  viewer: Viewer,
  action: string,
  entityId: string,
  metadata: Record<string, string | boolean>,
) {
  store().audits.unshift({
    id: ++store().sequence,
    actorId: viewer.id,
    action,
    entityType: "profile",
    entityId,
    metadata,
    createdAt: new Date().toISOString(),
  });
}

export function getE2EAdminUsers(viewer: Viewer) {
  assertE2EEnabled();
  requireE2EAdmin(viewer);
  return [...store().users.values()].map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    assignedCourseIds: [...user.assignedCourseIds],
  }));
}

export function setE2EUserRole(
  viewer: Viewer,
  targetUserId: string,
  role: AppRole,
) {
  assertE2EEnabled();
  requireE2EAdmin(viewer);
  const target = [...store().users.values()].find(
    (candidate) => candidate.id === targetUserId,
  );
  if (!target || target.id === viewer.id) throw new Error("FORBIDDEN");
  const previous = target.role;
  target.role = role;
  target.isActive = true;
  if (role !== "instructor") target.assignedCourseIds = [];
  pushE2EAudit(viewer, "profile.role_changed", target.id, {
    previousRole: previous,
    role,
  });
}

export function setE2EUserActive(
  viewer: Viewer,
  targetUserId: string,
  active: boolean,
) {
  assertE2EEnabled();
  requireE2EAdmin(viewer);
  const target = [...store().users.values()].find(
    (candidate) => candidate.id === targetUserId,
  );
  if (!target || target.id === viewer.id) throw new Error("FORBIDDEN");
  target.isActive = active;
  pushE2EAudit(
    viewer,
    active ? "user.activated" : "user.deactivated",
    target.id,
    { active },
  );
}

export function getE2EAdminAudits(viewer: Viewer) {
  assertE2EEnabled();
  requireE2EAdmin(viewer);
  return store().audits.map((audit) => structuredClone(audit));
}

export function getE2EAdminReport(viewer: Viewer) {
  assertE2EEnabled();
  if (!["admin", "instructor"].includes(viewer.role)) {
    throw new Error("FORBIDDEN");
  }
  const attempts = [
    ...store().practiceAttempts.values(),
    ...store().examAttempts.values(),
  ];
  return {
    summary: {
      activeUsers: [...store().users.values()].filter((user) => user.isActive)
        .length,
      attempts: attempts.length,
      averageScore: null,
      completionRate: 0,
      totalUsers: store().users.size,
    },
    chapterDifficulty: [],
    questionMetrics: [],
  };
}
