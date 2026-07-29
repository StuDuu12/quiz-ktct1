import {
  MagnifyingGlass,
  Plus,
  Question,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { saveQuestionForm } from "@/src/features/admin/actions";
import {
  getAdminCatalog,
  getAdminQuestions,
} from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminQuestionsPage({ searchParams }: PageProps) {
  await requireViewer(["admin", "instructor"]);
  const params = await searchParams;
  const rawCourse = Array.isArray(params.course) ? params.course[0] : params.course;
  const catalog = await getAdminCatalog().catch(() => null);
  const selectedCourse =
    catalog?.courses.some((course) => course.id === rawCourse)
      ? rawCourse!
      : catalog?.courses[0]?.id ?? null;
  const questions = catalog
    ? await getAdminQuestions(selectedCourse).catch(() => null)
    : null;
  const chapters =
    catalog?.chapters.filter((chapter) => chapter.courseId === selectedCourse) ??
    [];

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">NGÂN HÀNG CÂU HỎI</p>
          <h1>Biên soạn và xuất bản</h1>
          <p>Đáp án đúng chỉ đi qua RPC có kiểm tra phạm vi, không lộ ở truy vấn học viên.</p>
        </div>
        <Link className="admin-header-action is-secondary" href="/admin/import">
          Nhập Markdown
        </Link>
      </header>

      {!catalog || !questions ? (
        <section className="admin-error" role="alert">
          <WarningCircle size={30} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Không tải được ngân hàng câu hỏi</h2>
            <p>Hệ thống không hiển thị câu hỏi giả khi truy vấn thất bại.</p>
          </div>
        </section>
      ) : (
        <div className="admin-content-grid admin-question-layout">
          <section className="admin-panel">
            <header className="admin-table-toolbar">
              <div>
                <p className="admin-kicker">DANH SÁCH</p>
                <h2>{questions.length} câu hỏi</h2>
              </div>
              <form method="get" className="admin-inline-filter">
                <label>
                  <span>Khóa học</span>
                  <select name="course" defaultValue={selectedCourse ?? ""}>
                    {catalog.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" aria-label="Áp dụng bộ lọc">
                  <MagnifyingGlass size={19} weight="bold" aria-hidden="true" />
                </button>
              </form>
            </header>
            {questions.length ? (
              <>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Câu hỏi</th>
                      <th scope="col">Chương</th>
                      <th scope="col">Độ khó</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((question) => (
                      <tr key={question.id}>
                        <td>
                          <strong>
                            {question.sourceNumber
                              ? `Câu ${question.sourceNumber}: `
                              : ""}
                            {question.content}
                          </strong>
                          <span>
                            {question.options.length} phương án ·{" "}
                            {question.options.filter((option) => option.isCorrect).length} đáp án đúng
                          </span>
                        </td>
                        <td>{question.chapterTitle}</td>
                        <td>Mức {question.difficulty}</td>
                        <td>
                          <span className={`admin-status is-${question.status}`}>
                            {question.status === "published"
                              ? "Công khai"
                              : question.status === "archived"
                                ? "Lưu trữ"
                                : "Bản nháp"}
                          </span>
                        </td>
                        <td>
                          {new Intl.DateTimeFormat("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(new Date(question.updatedAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                <div className="admin-question-edit-list">
                  {questions.map((question) => (
                    <details key={question.id}>
                      <summary>
                        Chỉnh sửa{" "}
                        {question.sourceNumber
                          ? `câu ${question.sourceNumber}`
                          : question.content.slice(0, 45)}
                      </summary>
                      <form className="admin-form" action={saveQuestionForm}>
                        <input type="hidden" name="id" value={question.id} />
                        <label>
                          Chương
                          <select
                            name="chapter_id"
                            required
                            defaultValue={question.chapterId}
                          >
                            {chapters.map((chapter) => (
                              <option key={chapter.id} value={chapter.id}>
                                Chương {chapter.position}: {chapter.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-form-grid">
                          <label>
                            Số nguồn
                            <input
                              name="source_number"
                              type="number"
                              min={1}
                              defaultValue={question.sourceNumber ?? ""}
                            />
                          </label>
                          <label>
                            Độ khó
                            <select
                              name="difficulty"
                              defaultValue={question.difficulty}
                            >
                              <option value="1">1 · Dễ</option>
                              <option value="2">2 · Vừa</option>
                              <option value="3">3 · Khó</option>
                              <option value="4">4 · Nâng cao</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          Nội dung
                          <textarea
                            name="content"
                            rows={4}
                            required
                            defaultValue={question.content}
                          />
                        </label>
                        <fieldset className="admin-options-fieldset">
                          <legend>Bốn phương án A–D</legend>
                          {(["A", "B", "C", "D"] as const).map((label) => (
                            <label key={label}>
                              <span>{label}</span>
                              <input
                                name={`option_${label}`}
                                required
                                defaultValue={
                                  question.options.find(
                                    (option) => option.label === label,
                                  )?.content ?? ""
                                }
                              />
                            </label>
                          ))}
                        </fieldset>
                        <label>
                          Đáp án đúng
                          <select
                            name="correct_label"
                            required
                            defaultValue={
                              question.options.find((option) => option.isCorrect)
                                ?.label ?? ""
                            }
                          >
                            <option value="" disabled>
                              Chọn một phương án
                            </option>
                            {["A", "B", "C", "D"].map((label) => (
                              <option key={label} value={label}>
                                Phương án {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Lời giải
                          <textarea
                            name="explanation"
                            rows={4}
                            defaultValue={question.explanation}
                          />
                        </label>
                        <label>
                          Trạng thái
                          <select name="status" defaultValue={question.status}>
                            <option value="draft">Bản nháp</option>
                            <option value="published">Công khai</option>
                            <option value="archived">Lưu trữ</option>
                          </select>
                        </label>
                        <button className="admin-secondary-button" type="submit">
                          Lưu phiên bản mới
                        </button>
                      </form>
                    </details>
                  ))}
                </div>
              </>
            ) : (
              <div className="admin-empty">
                <Question size={30} weight="duotone" aria-hidden="true" />
                <div>
                  <h3>Chưa có câu hỏi</h3>
                  <p>Tạo thủ công hoặc dùng quy trình nhập có xem trước.</p>
                </div>
              </div>
            )}
          </section>

          <aside>
            <form className="admin-panel admin-form" action={saveQuestionForm}>
              <header>
                <div>
                  <p className="admin-kicker">CÂU HỎI MỚI</p>
                  <h2>Soạn câu hỏi</h2>
                </div>
                <Plus size={25} weight="duotone" aria-hidden="true" />
              </header>
              <label>
                Chương
                <select name="chapter_id" required>
                  <option value="">Chọn chương</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      Chương {chapter.position}: {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-form-grid">
                <label>
                  Số nguồn
                  <input name="source_number" type="number" min={1} />
                </label>
                <label>
                  Độ khó
                  <select name="difficulty" defaultValue="2">
                    <option value="1">1 · Dễ</option>
                    <option value="2">2 · Vừa</option>
                    <option value="3">3 · Khó</option>
                    <option value="4">4 · Nâng cao</option>
                  </select>
                </label>
              </div>
              <label>
                Nội dung
                <textarea name="content" rows={4} required />
              </label>
              <fieldset className="admin-options-fieldset">
                <legend>Bốn phương án A–D</legend>
                {(["A", "B", "C", "D"] as const).map((label) => (
                  <label key={label}>
                    <span>{label}</span>
                    <input name={`option_${label}`} required />
                  </label>
                ))}
              </fieldset>
              <label>
                Đáp án đúng
                <select name="correct_label" required defaultValue="">
                  <option value="" disabled>
                    Chọn một phương án
                  </option>
                  {["A", "B", "C", "D"].map((label) => (
                    <option key={label} value={label}>
                      Phương án {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lời giải
                <textarea name="explanation" rows={4} />
              </label>
              <label>
                Trạng thái
                <select name="status" defaultValue="draft">
                  <option value="draft">Lưu bản nháp</option>
                  <option value="published">Xuất bản</option>
                  <option value="archived">Lưu trữ</option>
                </select>
              </label>
              <p className="admin-form-note">
                Xuất bản chỉ thành công khi đủ A–D, đúng một đáp án và có lời giải.
              </p>
              <button className="admin-primary-button" type="submit">
                Lưu câu hỏi
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
