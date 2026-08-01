import { ArrowLeft, BookOpen } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultReview } from "@/src/features/history/components/result-review";
import { getAttemptResult } from "@/src/features/history/queries";
import { PracticeSession } from "@/src/features/practice/components/practice-session";
import type { PracticeState } from "@/src/features/practice/types";

type PageProps = {
  params: Promise<{ attemptId: string }>;
};

export default async function ResultPage({ params }: PageProps) {
  const { attemptId } = await params;
  const result = await getAttemptResult(attemptId).catch(() => null);
  if (!result) notFound();

  if (result.kind === "practice") {
    const practiceState: PracticeState = {
      attemptId: result.attemptId,
      courseSlug: "",
      chapterId: "",
      chapterPosition: 0,
      chapterTitle: "Kết quả luyện tập",
      currentQuestionId: result.questions[0]?.attemptQuestionId || "",
      status: "submitted",
      score: result.score,
      questions: result.questions.map(q => ({
        id: q.attemptQuestionId,
        attemptQuestionId: q.attemptQuestionId,
        content: q.content,
        explanation: q.explanation,
        options: q.options
      })),
      answers: result.questions.reduce((acc, q) => {
        acc[q.attemptQuestionId] = {
          optionId: q.selectedOptionId || undefined,
          flagged: q.isFlagged,
          locked: true,
          showFeedback: true,
          isCorrect: q.isCorrect,
          explanation: q.explanation,
          correctOptionId: q.correctOptionId
        };
        return acc;
      }, {} as Record<string, any>)
    };

    return (
      <PracticeSession
        initialState={practiceState}
        mode="review"
      />
    );
  }

  return (
    <main className="result-shell">
      <header className="history-header">
        <Link href="/dashboard" className="brand-mark">
          <BookOpen size={24} weight="fill" aria-hidden="true" />
          Ôn thi KTCT
        </Link>
        <nav aria-label="Điều hướng kết quả">
          <Link href="/history">
            <ArrowLeft size={17} aria-hidden="true" />
            Lịch sử
          </Link>
        </nav>
      </header>
      <ResultReview result={result} />
    </main>
  );
}
