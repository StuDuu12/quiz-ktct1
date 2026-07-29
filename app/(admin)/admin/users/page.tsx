import {
  ShieldCheck,
  UserCircle,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import {
  approveInstructorForm,
  inviteInstructorStateAction,
  resendInviteForm,
  revokeInstructorForm,
  setUserActiveForm,
  setUserRoleStateAction,
} from "@/src/features/admin/actions";
import { InviteInstructorForm } from "@/src/features/admin/components/invite-instructor-form";
import { UserRoleForm } from "@/src/features/admin/components/user-role-form";
import {
  getAdminCatalog,
  getAdminUsers,
} from "@/src/features/admin/queries";
import { requireViewer } from "@/src/features/auth/session";
import { getOptionalServerEnv } from "@/src/lib/server-env";

const roleLabel = {
  admin: "Quản trị viên",
  instructor: "Giảng viên",
  student: "Học viên",
};

export default async function AdminUsersPage() {
  await requireViewer(["admin"]);
  const loaded = await Promise.all([
    getAdminUsers(),
    getAdminCatalog(),
  ]).catch(() => null);
  const deliveryAvailable = Boolean(getOptionalServerEnv());
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">QUẢN TRỊ TRUY CẬP</p>
          <h1>Người dùng và phân quyền</h1>
          <p>Mọi thay đổi vai trò, trạng thái và phân công đều được ghi nhật ký.</p>
        </div>
      </header>

      {!loaded ? (
        <section className="admin-error" role="alert">
          <WarningCircle size={30} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Không tải được danh sách người dùng</h2>
            <p>Hãy kiểm tra quyền truy cập và kết nối Supabase.</p>
          </div>
        </section>
      ) : (
        <div className="admin-users-layout">
          <section className="admin-panel">
            <header>
              <div>
                <p className="admin-kicker">TÀI KHOẢN</p>
                <h2>{loaded[0].length} người dùng</h2>
              </div>
              <UsersThree size={27} weight="duotone" aria-hidden="true" />
            </header>
            {loaded[0].length ? (
              <div className="admin-user-list">
                {loaded[0].map((user) => (
                  <article key={user.id}>
                    <UserCircle size={34} weight="duotone" aria-hidden="true" />
                    <div className="admin-user-identity">
                      <strong>{user.fullName || "Chưa cập nhật họ tên"}</strong>
                      <span>{user.email}</span>
                    </div>
                    <div className="admin-user-role">
                      <span className={`admin-status is-${user.isActive ? "published" : "archived"}`}>
                        {user.isActive ? "Hoạt động" : "Đã khóa"}
                      </span>
                      <strong>{roleLabel[user.role]}</strong>
                    </div>
                    <details>
                      <summary>Quyền và phân công</summary>
                      <div className="admin-user-actions">
                        <UserRoleForm
                          userId={user.id}
                          userLabel={user.fullName || user.email}
                          role={user.role}
                          action={setUserRoleStateAction}
                        />
                        {user.role !== "admin" ? (
                          <form action={approveInstructorForm}>
                            <input type="hidden" name="user_id" value={user.id} />
                            <fieldset>
                              <legend>Khóa học được phân công</legend>
                              <div className="admin-checkbox-grid">
                                {loaded[1].courses.map((course) => (
                                  <label key={course.id}>
                                    <input
                                      type="checkbox"
                                      name="course_ids"
                                      value={course.id}
                                      defaultChecked={user.assignedCourseIds.includes(course.id)}
                                    />
                                    {course.title}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <button className="admin-secondary-button" type="submit">
                              <ShieldCheck size={18} weight="bold" aria-hidden="true" />
                              Phê duyệt / cập nhật giảng viên
                            </button>
                          </form>
                        ) : null}
                        {user.role === "instructor" ? (
                          <form action={revokeInstructorForm}>
                            <input type="hidden" name="user_id" value={user.id} />
                            <button className="admin-text-button" type="submit">
                              Thu hồi vai trò giảng viên
                            </button>
                          </form>
                        ) : null}
                        <form action={setUserActiveForm}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={user.isActive ? "false" : "true"}
                          />
                          <button className="admin-text-button is-danger" type="submit">
                            {user.isActive ? "Khóa tài khoản" : "Mở lại tài khoản"}
                          </button>
                        </form>
                        {user.role !== "admin" ? (
                          <form action={resendInviteForm}>
                            <input type="hidden" name="email" value={user.email} />
                            <input
                              type="hidden"
                              name="full_name"
                              value={user.fullName}
                            />
                            <button className="admin-text-button" type="submit">
                              Gửi lại email mời / xác minh
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty">
                <UsersThree size={30} weight="duotone" aria-hidden="true" />
                <div>
                  <h3>Chưa có người dùng</h3>
                  <p>Dữ liệu sẽ xuất hiện sau khi có hồ sơ xác thực.</p>
                </div>
              </div>
            )}
          </section>

          <aside>
            <InviteInstructorForm
              courses={loaded[1].courses.map(({ id, title }) => ({ id, title }))}
              deliveryAvailable={deliveryAvailable}
              action={inviteInstructorStateAction}
            />
          </aside>
        </div>
      )}
    </>
  );
}
