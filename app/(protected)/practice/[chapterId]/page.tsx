import { notFound, redirect } from "next/navigation";

import {
  finishPractice,
  getPracticeChapterById,
  loadPracticeSession,
  savePracticeAnswer,
  savePracticeFlag,
  startPractice,
} from "@/src/features/practice/actions";
import { PracticeSession } from "@/src/features/practice/components/practice-session";

type PageProps = {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ attempt?: string | string[] }>;
};

export default async function PracticePage({ params, searchParams }: PageProps) {
  const { chapterId } = await params;
  const chapter = await getPracticeChapterById(chapterId).catch(() => null);
  if (!chapter) notFound();

  const query = await searchParams;
  const attemptId = typeof query.attempt === "string" ? query.attempt : null;
  if (!attemptId) {
    const started = await startPractice(chapterId);
    redirect(`/practice/${chapterId}?attempt=${started.attemptId}`);
  }

  const state = await loadPracticeSession(chapterId, attemptId).catch(() => null);
  if (!state) notFound();
  return (
    <PracticeSession
      initialState={state}
      saveAnswer={savePracticeAnswer}
      saveFlag={savePracticeFlag}
      finish={finishPractice}
    />
  );
}
