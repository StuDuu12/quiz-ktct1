import { ArrowRight, BookOpen, ClipboardText, Clock, Target, TrendUp } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ChapterRow } from "@/src/features/catalog/components/chapter-row";
import type { CourseDashboard } from "@/src/features/catalog/queries";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value),
  );
}

export function CourseOverview({ dashboard }: { dashboard: CourseDashboard }) {
  const { course, chapters, overallProgress, questionCount, recentAttempts } = dashboard;
  return (
    <main className="learner-shell">
      <header className="learner-header">
        <Link href="/dashboard" className="brand-mark"><BookOpen size={24} weight="fill" /> Ôn thi KTCT</Link>
        <nav aria-label="Điều hướng học viên"><Link href="/dashboard" aria-current="page">Tổng quan</Link><Link href="/history">Lịch sử</Link></nav>
      </header>

      <section className="course-hero" aria-labelledby="course-title">
        <div>
          <p className="eyebrow">HỌC PHẦN CỦA BẠN</p>
          <h1 id="course-title">{course.title}</h1>
          <p className="course-description">{course.description || "Luyện tập theo từng chương, theo dõi tiến độ và sẵn sàng cho bài thi."}</p>
          <div className="course-facts"><span><BookOpen size={17} /> {chapters.length} chương</span><span><ClipboardText size={17} /> {questionCount} câu hỏi</span></div>
        </div>
        <div className="progress-card" aria-label="Tiến độ tổng quan">
          <span>Độ chính xác gần đây</span>
          <strong>{overallProgress === null ? "Chưa có dữ liệu" : `${overallProgress}%`}</strong>
          <div className="progress-track"><i style={{ width: `${overallProgress ?? 0}%` }} /></div>
          <p>{overallProgress === null ? "Hoàn thành một lượt luyện tập để xem tiến độ." : "Dựa trên các lượt luyện tập đã nộp."}</p>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Kế hoạch ôn tập">
        <div className="chapter-panel">
          <div className="section-heading"><div><p className="eyebrow">LỘ TRÌNH</p><h2>Luyện theo chương</h2></div><span>{chapters.length} chương</span></div>
          <div className="chapter-list">
            {chapters.map((chapter) => <ChapterRow key={chapter.id} chapter={chapter} courseSlug={course.slug} />)}
          </div>
        </div>

        <aside className="study-aside">
          <section className="mock-card" aria-labelledby="mock-title">
            <div className="mock-icon"><Target size={26} weight="fill" /></div>
            <p className="eyebrow">THI THỬ TỔNG HỢP</p>
            <h2 id="mock-title">Sẵn sàng kiểm tra kiến thức?</h2>
            <p>Đề gồm 40 câu, phân bổ giữa các chương. Đồng hồ sẽ bắt đầu khi bạn vào đề.</p>
            <div className="exam-meta"><span><ClipboardText size={17} /> 40 câu</span><span><Clock size={17} /> 60 phút</span></div>
            <Link className="primary-action" href={`/courses/${course.slug}/mock-exam`}>Bắt đầu thi thử <ArrowRight size={17} /></Link>
          </section>
          <section className="tip-card"><TrendUp size={22} weight="duotone" /><div><strong>Mẹo ôn tập</strong><p>Làm lại chương có độ chính xác thấp trước khi vào đề thi thử.</p></div></section>
        </aside>
      </section>

      <section className="history-section" id="history" aria-labelledby="history-title">
        <div className="section-heading"><div><p className="eyebrow">NHẬT KÝ HỌC TẬP</p><h2 id="history-title">Lượt làm gần đây</h2></div></div>
        {recentAttempts.length === 0 ? (
          <div className="empty-state"><ClipboardText size={28} weight="duotone" /><div><h3>Bạn chưa có lượt làm nào</h3><p>Chọn một chương để bắt đầu lưu lịch sử và theo dõi kết quả của bạn.</p></div></div>
        ) : (
          <div className="attempt-list">
            {recentAttempts.map((attempt) => <article key={attempt.id} className="attempt-row"><div className="attempt-icon"><ClipboardText size={19} weight="duotone" /></div><div><strong>{attempt.kind === "mock_exam" ? "Thi thử tổng hợp" : "Luyện tập theo chương"}</strong><p>{formatDate(attempt.submittedAt ?? attempt.startedAt)}</p></div><span className={`status-pill status-${attempt.status}`}>{attempt.status === "submitted" ? "Đã nộp" : attempt.status === "expired" ? "Hết giờ" : "Đang làm"}</span>{attempt.status === "submitted" ? <Link className="attempt-score" href={`/results/${attempt.id}`} aria-label={`Xem kết quả ${Math.round(attempt.score ?? 0)}%`}>{Math.round(attempt.score ?? 0)}%</Link> : <strong className="attempt-score">—</strong>}</article>)}
          </div>
        )}
      </section>
    </main>
  );
}
