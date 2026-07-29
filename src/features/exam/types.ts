export type ExamQuestion = {
  id: string;
  chapterId: string;
};

export type ExamOptionSnapshot = {
  id: string;
  label: string;
  content: string;
};

export type ExamQuestionSnapshot = {
  id: string;
  attemptQuestionId: string;
  content: string;
  difficulty: number;
  options: ExamOptionSnapshot[];
};

export type ExamAnswer = {
  optionId?: string;
  flagged: boolean;
};

export type ExamAttemptStatus = "in_progress" | "submitted" | "expired";

export type ExamSessionState = {
  attemptId: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  status: ExamAttemptStatus;
  startedAt: string;
  expiresAt: string;
  serverNow: string;
  submittedAt: string | null;
  score: number | null;
  durationSeconds: number | null;
  currentQuestionId: string;
  questions: ExamQuestionSnapshot[];
  answers: Record<string, ExamAnswer>;
};

export type SaveExamAnswer = (
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) => Promise<{ optionId: string; flagged: boolean }>;

export type ToggleExamFlag = (
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) => Promise<void>;

export type SubmitExamResult = {
  attemptId: string;
  status: "submitted";
  score: number;
  submittedAt: string;
  durationSeconds: number;
};

export type SubmitExam = (
  attemptId: string,
) => Promise<SubmitExamResult>;

export type AttemptSnapshot = {
  id: string;
  userId: string;
  courseId: string;
  examConfigId: string;
  startedAt: string;
  expiresAt: string;
  questions: ExamQuestionSnapshot[];
};
