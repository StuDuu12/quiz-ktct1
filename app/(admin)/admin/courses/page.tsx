import {
  BookOpenText,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import {
  saveChapterForm,
  saveCourseForm,
} from "@/src/features/admin/actions";
import { getAdminCatalog } from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

const statusLabel: Record<string, string> = {
  draft: "Bản nháp",
  published: "Đang công khai",
  archived: "Đã lưu trữ",
};

export default async function AdminCoursesPage() {
  const viewer = await requireViewer(["admin", "instructor"]);
  const catalog = await getAdminCatalog().catch(() => null);
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">CẤU TRÚC NỘI DUNG</p>
          <h1>Khóa học và chương</h1>
          <p>Tạo, sắp xếp và kiểm soát trạng thái xuất bản trong đúng phạm vi.</p>
        </div>
      </header>

      {!catalog ? (
        <section className="admin-error" role="alert">
          <WarningCircle size={30} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Không tải được danh mục</h2>
            <p>Không có dữ liệu tĩnh thay thế.</p>
          </div>
        </section>
      ) : (
        <div className="admin-content-grid">
          <section className="admin-panel">
            <header>
              <div>
                <p className="admin-kicker">DANH SÁCH</p>
                <h2>{catalog.courses.length} khóa học trong phạm vi</h2>
              </div>
              <BookOpenText size={27} weight="duotone" aria-hidden="true" />
            </header>
            {catalog.courses.length ? (
              <div className="admin-course-list">
                {catalog.courses.map((course) => {
                  const chapters = catalog.chapters.filter(
                    (chapter) => chapter.courseId === course.id,
                  );
                  return (
                    <article key={course.id}>
                      <div className="admin-course-heading">
                        <div>
                          <span className={`admin-status is-${course.status}`}>
                            {statusLabel[course.status] ?? course.status}
                          </span>
                          <h3>{course.title}</h3>
                          <p>{course.description || "Chưa có mô tả."}</p>
                        </div>
                        <strong>{chapters.length} chương</strong>
                      </div>
                      <ol>
                        {chapters.map((chapter) => (
                          <li key={chapter.id}>
                            <span>{chapter.position}</span>
                            <strong>{chapter.title}</strong>
                            <em className={`admin-status is-${chapter.status}`}>
                              {statusLabel[chapter.status] ?? chapter.status}
                            </em>
                          </li>
                        ))}
                      </ol>
                      {chapters.length ? (
                        <div className="admin-chapter-edit-list">
                          {chapters.map((chapter) => (
                            <details key={chapter.id}>
                              <summary>
                                Chỉnh sửa chương {chapter.position}: {chapter.title}
                              </summary>
                              <form className="admin-form" action={saveChapterForm}>
                                <input type="hidden" name="id" value={chapter.id} />
                                <input
                                  type="hidden"
                                  name="course_id"
                                  value={course.id}
                                />
                                <div className="admin-form-grid">
                                  <label>
                                    Vị trí
                                    <input
                                      name="position"
                                      type="number"
                                      min={1}
                                      required
                                      defaultValue={chapter.position}
                                    />
                                  </label>
                                  <label>
                                    Trạng thái
                                    <select name="status" defaultValue={chapter.status}>
                                      <option value="draft">Bản nháp</option>
                                      <option value="published">Công khai</option>
                                      <option value="archived">Lưu trữ</option>
                                    </select>
                                  </label>
                                </div>
                                <label>
                                  Tên chương
                                  <input name="title" required defaultValue={chapter.title} />
                                </label>
                                <button className="admin-secondary-button" type="submit">
                                  Lưu chương
                                </button>
                              </form>
                            </details>
                          ))}
                        </div>
                      ) : null}
                      <details>
                        <summary>Chỉnh sửa khóa học</summary>
                        <form className="admin-form" action={saveCourseForm}>
                          <input type="hidden" name="id" value={course.id} />
                          <div className="admin-form-grid">
                            <label>
                              Tên khóa học
                              <input name="title" required defaultValue={course.title} />
                            </label>
                            <label>
                              Đường dẫn
                              <input name="slug" required defaultValue={course.slug} />
                            </label>
                            <label>
                              Trạng thái
                              <select name="status" defaultValue={course.status}>
                                <option value="draft">Bản nháp</option>
                                <option value="published">Công khai</option>
                                <option value="archived">Lưu trữ</option>
                              </select>
                            </label>
                            <label>
                              URL ảnh bìa
                              <input
                                name="cover_url"
                                type="url"
                                defaultValue={course.coverUrl ?? ""}
                              />
                            </label>
                          </div>
                          <label>
                            Mô tả
                            <textarea name="description" rows={3} defaultValue={course.description} />
                          </label>
                          <button className="admin-primary-button" type="submit">
                            Lưu thay đổi
                          </button>
                        </form>
                      </details>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="admin-empty">
                <BookOpenText size={30} weight="duotone" aria-hidden="true" />
                <div>
                  <h3>Chưa có khóa học trong phạm vi</h3>
                  <p>Giảng viên cần được quản trị viên phân công rõ ràng.</p>
                </div>
              </div>
            )}
          </section>

          <aside className="admin-side-stack">
            {viewer.role === "admin" ? (
              <form className="admin-panel admin-form" action={saveCourseForm}>
                <header>
                  <div>
                    <p className="admin-kicker">KHÓA HỌC MỚI</p>
                    <h2>Tạo khóa học</h2>
                  </div>
                  <Plus size={25} weight="duotone" aria-hidden="true" />
                </header>
                <label>
                  Tên khóa học
                  <input name="title" required />
                </label>
                <label>
                  Đường dẫn
                  <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
                </label>
                <label>
                  Mô tả
                  <textarea name="description" rows={3} />
                </label>
                <label>
                  URL ảnh bìa
                  <input name="cover_url" type="url" />
                </label>
                <label>
                  Trạng thái
                  <select name="status" defaultValue="draft">
                    <option value="draft">Bản nháp</option>
                    <option value="published">Công khai</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </label>
                <button className="admin-primary-button" type="submit">
                  Tạo khóa học
                </button>
              </form>
            ) : null}

            <form className="admin-panel admin-form" action={saveChapterForm}>
              <header>
                <div>
                  <p className="admin-kicker">CHƯƠNG MỚI</p>
                  <h2>Thêm vào khóa học</h2>
                </div>
                <Plus size={25} weight="duotone" aria-hidden="true" />
              </header>
              <label>
                Khóa học
                <select name="course_id" required>
                  <option value="">Chọn khóa học</option>
                  {catalog.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-form-grid">
                <label>
                  Vị trí
                  <input name="position" type="number" min={1} required />
                </label>
                <label>
                  Trạng thái
                  <select name="status" defaultValue="draft">
                    <option value="draft">Bản nháp</option>
                    <option value="published">Công khai</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </label>
              </div>
              <label>
                Tên chương
                <input name="title" required />
              </label>
              <button className="admin-primary-button" type="submit">
                Thêm chương
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
