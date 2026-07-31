import {
  MagnifyingGlass,
  Plus,
  Question,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { saveQuestionForm } from "@/src/features/admin/actions";
import { ChapterQuestionManager } from "@/src/features/admin/components/chapter-question-manager";
import {
  getAdminCatalog,
  getAdminQuestions,
} from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminQuestionsPage({ searchParams }: PageProps) {
  const viewer = await requireViewer(["admin", "instructor"]);
  const portalPath = viewer.role === "instructor" ? "/instructor" : "/admin";
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
          <h1>Biên soạn và quản lý theo chương</h1>
          <p>Phân loại câu hỏi theo 6 chương, chỉnh sửa và xóa câu hỏi an toàn.</p>
        </div>
        <Link className="admin-header-action is-secondary" href={`${portalPath}/import`}>
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
          <section className="admin-panel space-y-4">
            <header className="admin-table-toolbar">
              <div>
                <p className="admin-kicker">QUẢN LÝ CÂU HỎI THEO CHƯƠNG</p>
                <h2>{questions.length} câu hỏi tổng cộng</h2>
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
              <ChapterQuestionManager questions={questions} chapters={chapters} />
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
                    <option value="1">1 · Nhận biết</option>
                    <option value="2">2 · Thông hiểu</option>
                    <option value="3">3 · Vận dụng</option>
                    <option value="4">4 · Vận dụng cao</option>
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
