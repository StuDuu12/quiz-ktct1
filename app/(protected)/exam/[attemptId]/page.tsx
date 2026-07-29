import { notFound } from "next/navigation";

import {
  loadExamSession,
  saveExamAnswer,
  submitAttempt,
  toggleFlag,
} from "@/src/features/exam/actions";
import { ExamSession } from "@/src/features/exam/components/exam-session";

type PageProps = {
  params: Promise<{ attemptId: string }>;
};

export default async function ExamPage({ params }: PageProps) {
  const { attemptId } = await params;
  const state = await loadExamSession(attemptId).catch(() => null);
  if (!state) notFound();

  return (
    <ExamSession
      initialState={state}
      saveAnswer={saveExamAnswer}
      saveFlag={toggleFlag}
      submit={submitAttempt}
    />
  );
}
