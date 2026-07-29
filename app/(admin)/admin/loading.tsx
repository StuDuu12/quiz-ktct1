export default function AdminLoading() {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <div>
        <strong>Đang tải dữ liệu quản trị</strong>
        <p>Hệ thống đang đọc dữ liệu thật trong phạm vi quyền.</p>
      </div>
    </div>
  );
}
