import { ArrowLeft, BookOpen } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultReview } from "@/src/features/history/components/result-review";
import { getAttemptResult } from "@/src/features/history/queries";

type PageProps = {
  params: Promise<{ attemptId: string }>;
};

export default async function ResultPage({ params }: PageProps) {
  const { attemptId } = await params;
  const result = await getAttemptResult(attemptId).catch(() => null);
  if (!result) notFound();

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
