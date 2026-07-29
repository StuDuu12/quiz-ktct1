import { notFound } from "next/navigation";

import {
  finishPractice,
  getPracticeChapterByRoute,
  loadPracticeSession,
  savePracticeAnswer,
  savePracticeFlag,
  startOrResumePracticeForRoute,
} from "@/src/features/practice/actions";
import { PracticeLaunchForm } from "@/src/features/practice/components/practice-launch-form";
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
    return (
      <PracticeLaunchForm
        action={startOrResumePracticeForRoute.bind(
          null,
          chapter.course.slug,
          chapter.position,
        )}
        chapterTitle={chapter.title}
      />
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
