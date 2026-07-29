export type ExamQuestion = {
  id: string;
  chapterId: string;
};

export type AttemptSnapshot = {
  id: string;
  userId: string;
  courseId: string;
  examConfigId: string;
  startedAt: string;
  expiresAt: string;
  questions: {
    id: string;
    attemptQuestionId: string;
    content: string;
    difficulty: number;
    options: {
      id: string;
      label: string;
      content: string;
    }[];
  }[];
};
