export type PracticeOption = {
  id: string;
  label: string;
  content: string;
};

export type PracticeQuestion = {
  id: string;
  attemptQuestionId: string;
  content: string;
  explanation: string;
  options: PracticeOption[];
};

export type PracticeAnswer = {
  optionId?: string;
  flagged: boolean;
  locked: boolean;
  showFeedback: boolean;
  isCorrect?: boolean;
  explanation?: string;
  correctOptionId?: string;
};

export type PracticeState = {
  attemptId: string;
  courseSlug: string;
  chapterId: string;
  chapterPosition: number;
  chapterTitle: string;
  currentQuestionId: string;
  status: "in_progress" | "submitted" | "expired";
  score?: number | null;
  questions: PracticeQuestion[];
  answers: Record<string, PracticeAnswer>;
};

export type PracticeFeedback = {
  optionId: string;
  isCorrect: boolean;
  explanation: string;
  reconciled: boolean;
  correctOptionId?: string;
};

export type FinishPracticeResult =
  | { status: "submitted"; score: number }
  | { status: "expired"; score: null };

export type SavePracticeAnswer = (
  attemptId: string,
  attemptQuestionId: string,
  optionId: string,
) => Promise<PracticeFeedback>;

export type SavePracticeFlag = (
  attemptId: string,
  attemptQuestionId: string,
  flagged: boolean,
) => Promise<void>;

export type FinishPractice = (
  attemptId: string,
) => Promise<FinishPracticeResult>;
