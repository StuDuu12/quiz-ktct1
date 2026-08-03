import { CircleNotch } from "@phosphor-icons/react/dist/ssr";

type ExamLoadingProps = {
  title: string;
  description: string;
};

export function ExamLoading({ title, description }: ExamLoadingProps) {
  return (
    <main className="exam-loading-shell">
      <section role="status" aria-live="polite" aria-atomic="true">
        <span className="exam-loading-icon" aria-hidden="true">
          <CircleNotch size={34} weight="bold" />
        </span>
        <p className="exam-kicker">THI THỬ TỔNG HỢP</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="exam-loading-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}
