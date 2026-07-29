import {
  ChartBar,
  ClockCounterClockwise,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import {
  getAdminAudits,
  getAdminReport,
} from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

const auditLabel: Record<string, string> = {
  "course.created": "Tạo khóa học",
  "course.updated": "Cập nhật khóa học",
  "chapter.created": "Tạo chương",
  "chapter.updated": "Cập nhật chương",
  "question.created": "Tạo câu hỏi",
  "question.updated": "Cập nhật câu hỏi",
  "questions.imported": "Nhập câu hỏi",
  "instructor.approved": "Phê duyệt giảng viên",
  "instructor.revoked": "Thu hồi giảng viên",
  "user.deactivated": "Khóa tài khoản",
  "user.activated": "Mở tài khoản",
  "invite.sent": "Gửi lời mời",
  "invite.failed": "Lời mời thất bại",
};

export default async function AdminReportsPage() {
  const viewer = await requireViewer(["admin", "instructor"]);
  const report = await getAdminReport().catch(() => null);
  const audits =
    viewer.role === "admin" ? await getAdminAudits().catch(() => null) : [];
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">PHÂN TÍCH THỰC TẾ</p>
          <h1>Báo cáo học tập</h1>
          <p>
            Chỉ số tổng hợp theo phạm vi quyền; không trả khóa đáp án hoặc dữ
            liệu chi tiết của khóa học không được phân công.
          </p>
        </div>
      </header>

      {!report ? (
        <section className="admin-error" role="alert">
          <WarningCircle size={30} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Không tải được báo cáo</h2>
            <p>Không có biểu đồ hay chỉ số giả được hiển thị.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="admin-metric-grid" aria-label="Tổng hợp báo cáo">
            <article>
              <span>Người dùng hoạt động</span>
              <strong>{report.summary.activeUsers}</strong>
              <small>30 ngày gần nhất</small>
            </article>
            <article>
              <span>Lượt làm bài</span>
              <strong>{report.summary.attempts}</strong>
              <small>Trong phạm vi</small>
            </article>
            <article>
              <span>Điểm trung bình</span>
              <strong>
                {report.summary.averageScore === null
                  ? "Chưa có"
                  : `${report.summary.averageScore}%`}
              </strong>
              <small>Lượt đã nộp</small>
            </article>
            <article>
              <span>Tỷ lệ hoàn thành</span>
              <strong>{report.summary.completionRate}%</strong>
              <small>Đã nộp / tất cả</small>
            </article>
          </section>

          <div className="admin-report-grid">
            <section className="admin-panel">
              <header>
                <div>
                  <p className="admin-kicker">CHƯƠNG KHÓ</p>
                  <h2>Tỷ lệ trả lời sai</h2>
                </div>
                <ChartBar size={27} weight="duotone" aria-hidden="true" />
              </header>
              {report.chapterDifficulty.length ? (
                <div className="admin-difficulty-list">
                  {report.chapterDifficulty.map((chapter) => (
                    <article key={chapter.chapterId ?? chapter.chapterTitle}>
                      <div>
                        <strong>{chapter.chapterTitle}</strong>
                        <span>{chapter.answers} câu trả lời có lựa chọn</span>
                      </div>
                      <span className="admin-rate">{chapter.incorrectRate}% sai</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-empty admin-empty-compact">
                  <ChartBar size={27} weight="duotone" aria-hidden="true" />
                  <div>
                    <h3>Chưa có dữ liệu theo chương</h3>
                    <p>Cần có lượt bài đã nộp và câu trả lời.</p>
                  </div>
                </div>
              )}
            </section>

            <section className="admin-panel">
              <header>
                <div>
                  <p className="admin-kicker">HIỆU QUẢ CÂU HỎI</p>
                  <h2>Phương án nhiễu</h2>
                </div>
              </header>
              {report.questionMetrics.length ? (
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Câu hỏi</th>
                        <th scope="col">Lượt</th>
                        <th scope="col">Đúng</th>
                        <th scope="col">Bỏ trống</th>
                        <th scope="col">Nhiễu phổ biến</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.questionMetrics.slice(0, 30).map((question) => (
                        <tr key={question.questionId}>
                          <td>
                            <strong>{question.questionContent}</strong>
                            <span>{question.chapterTitle ?? "Chưa xác định"}</span>
                          </td>
                          <td>{question.attempts}</td>
                          <td>{question.correctRate}%</td>
                          <td>{question.unansweredRate}%</td>
                          <td>
                            {question.mostSelectedDistractor
                              ? `${question.mostSelectedDistractor} · ${
                                  question.distractorRates[
                                    question.mostSelectedDistractor
                                  ] ?? 0
                                }%`
                              : "Chưa có"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty admin-empty-compact">
                  <ChartBar size={27} weight="duotone" aria-hidden="true" />
                  <div>
                    <h3>Chưa đủ dữ liệu câu hỏi</h3>
                    <p>Tỷ lệ nhiễu được tính từ lựa chọn thật của học viên.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {viewer.role === "admin" ? (
        <section className="admin-panel admin-audit-section">
          <header>
            <div>
              <p className="admin-kicker">NHẬT KÝ KIỂM TOÁN</p>
              <h2>Thay đổi gần đây</h2>
            </div>
            <ClockCounterClockwise size={27} weight="duotone" aria-hidden="true" />
          </header>
          {audits === null ? (
            <p className="admin-inline-warning" role="alert">
              Không tải được nhật ký.
            </p>
          ) : audits.length ? (
            <div className="admin-audit-list">
              {audits.map((audit) => (
                <article key={audit.id}>
                  <span>{auditLabel[audit.action] ?? audit.action}</span>
                  <strong>{audit.entityType}</strong>
                  <time dateTime={audit.createdAt}>
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(audit.createdAt))}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-empty admin-empty-compact">
              <ClockCounterClockwise size={27} weight="duotone" aria-hidden="true" />
              <div>
                <h3>Chưa có thay đổi được ghi</h3>
                <p>Nhật ký sẽ xuất hiện ngay sau mutation đầu tiên.</p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
