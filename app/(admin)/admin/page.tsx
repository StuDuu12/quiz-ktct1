import {
  ArrowRight,
  BookOpenText,
  ChartBar,
  CheckCircle,
  Exam,
  Question,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import {
  getAdminCatalog,
  getAdminReport,
} from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

function metric(value: number | null, suffix = "") {
  return value === null ? "Chưa có dữ liệu" : `${value.toLocaleString("vi-VN")}${suffix}`;
}

export default async function AdminDashboardPage() {
  const viewer = await requireViewer(["admin", "instructor"]);
  const loaded = await Promise.all([
    getAdminCatalog(),
    getAdminReport(),
  ]).catch(() => null);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">TRUNG TÂM ĐIỀU HÀNH</p>
          <h1>Chào buổi làm việc</h1>
          <p>
            Theo dõi nội dung và kết quả thật trong{" "}
            {viewer.role === "admin"
              ? "toàn hệ thống"
              : "các khóa học đã được phân công"}.
          </p>
        </div>
        <Link className="admin-header-action" href="/admin/questions">
          <Question size={19} weight="bold" aria-hidden="true" />
          Thêm câu hỏi
        </Link>
      </header>

      {!loaded ? (
        <section className="admin-error" role="alert">
          <WarningCircle size={30} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Chưa tải được dữ liệu quản trị</h2>
            <p>Không có số liệu giả được thay thế. Hãy kiểm tra kết nối Supabase.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="admin-metric-grid" aria-label="Chỉ số tổng quan">
            <article>
              <span className="admin-metric-icon is-teal">
                <UsersThree size={23} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <span>Người dùng hoạt động</span>
                <strong>{metric(loaded[1].summary.activeUsers)}</strong>
                <small>Trong 30 ngày gần nhất</small>
              </div>
            </article>
            <article>
              <span className="admin-metric-icon is-apricot">
                <Exam size={23} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <span>Lượt làm bài</span>
                <strong>{metric(loaded[1].summary.attempts)}</strong>
                <small>Mọi trạng thái trong phạm vi</small>
              </div>
            </article>
            <article>
              <span className="admin-metric-icon is-green">
                <ChartBar size={23} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <span>Điểm trung bình</span>
                <strong>{metric(loaded[1].summary.averageScore, "%")}</strong>
                <small>Chỉ các lượt đã nộp</small>
              </div>
            </article>
            <article>
              <span className="admin-metric-icon is-blue">
                <CheckCircle size={23} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <span>Tỷ lệ hoàn thành</span>
                <strong>{metric(loaded[1].summary.completionRate, "%")}</strong>
                <small>Lượt đã nộp trên tổng lượt</small>
              </div>
            </article>
          </section>

          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <header>
                <div>
                  <p className="admin-kicker">ĐỘ KHÓ THEO CHƯƠNG</p>
                  <h2>Cần ưu tiên rà soát</h2>
                </div>
                <Link href="/admin/reports">Xem báo cáo</Link>
              </header>
              {loaded[1].chapterDifficulty.length ? (
                <div className="admin-difficulty-list">
                  {loaded[1].chapterDifficulty.slice(0, 6).map((chapter) => (
                    <article key={chapter.chapterId ?? chapter.chapterTitle}>
                      <div>
                        <strong>{chapter.chapterTitle}</strong>
                        <span>{chapter.answers} câu trả lời</span>
                      </div>
                      <span className="admin-rate">{chapter.incorrectRate}% sai</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-empty admin-empty-compact">
                  <ChartBar size={27} weight="duotone" aria-hidden="true" />
                  <div>
                    <h3>Chưa có lượt trả lời</h3>
                    <p>Báo cáo sẽ xuất hiện khi học viên nộp bài.</p>
                  </div>
                </div>
              )}
            </section>

            <aside className="admin-panel admin-scope-summary">
              <header>
                <div>
                  <p className="admin-kicker">PHẠM VI NỘI DUNG</p>
                  <h2>Ngân hàng hiện có</h2>
                </div>
                <BookOpenText size={27} weight="duotone" aria-hidden="true" />
              </header>
              <dl>
                <div>
                  <dt>Khóa học</dt>
                  <dd>{loaded[0].courses.length}</dd>
                </div>
                <div>
                  <dt>Chương</dt>
                  <dd>{loaded[0].chapters.length}</dd>
                </div>
                <div>
                  <dt>Lần nhập gần đây</dt>
                  <dd>{loaded[0].importJobs.length}</dd>
                </div>
              </dl>
              <Link href="/admin/courses">
                Quản lý nội dung
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
