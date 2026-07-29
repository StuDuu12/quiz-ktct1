import { ImportWorkspace } from "@/src/features/admin/components/import-workspace";
import { commitQuestionImport } from "@/src/features/admin/actions";
import { getAdminCatalog } from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";

export default async function AdminImportPage() {
  await requireViewer(["admin", "instructor"]);
  const catalog = await getAdminCatalog();
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">NHẬP CÓ KIỂM SOÁT</p>
          <h1>Nhập câu hỏi từ Markdown</h1>
          <p>
            Phân tích bằng parser chuẩn, xem lỗi và trùng trước khi xác nhận một
            giao dịch nguyên tử.
          </p>
        </div>
      </header>
      <ImportWorkspace
        courses={catalog.courses.map(({ id, title }) => ({ id, title }))}
        chapters={catalog.chapters.map(
          ({ id, courseId, position, title }) => ({
            id,
            courseId,
            position,
            title,
          }),
        )}
        commitAction={commitQuestionImport}
      />
    </>
  );
}
