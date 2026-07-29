import { notFound, redirect } from "next/navigation";

import {
  finishPractice,
  getPracticeChapterByRoute,
  loadPracticeSession,
  savePracticeAnswer,
  savePracticeFlag,
  startPractice,
} from "@/src/features/practice/actions";
import { PracticeSession } from "@/src/features/practice/components/practice-session";

type PageProps = {
  params: Promise<{ courseSlug: string; position: string }>;
  searchParams: Promise<{ attempt?: string | string[] }>;
};

export default async function CoursePracticePage({
  params,
  searchParams,
}: PageProps) {
  const { courseSlug, position: rawPosition } = await params;
  const position = Number(rawPosition);
  if (!Number.isInteger(position) || position < 1) notFound();

  const chapter = await getPracticeChapterByRoute(courseSlug, position).catch(
    () => null,
  );
  if (!chapter) notFound();

  const query = await searchParams;
  const attemptId = typeof query.attempt === "string" ? query.attempt : null;
  if (!attemptId) {
    const started = await startPractice(chapter.id);
    redirect(
      `/courses/${courseSlug}/chapters/${position}/practice?attempt=${started.attemptId}`,
    );
  }

  const state = await loadPracticeSession(chapter.id, attemptId).catch(
    () => null,
  );
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
