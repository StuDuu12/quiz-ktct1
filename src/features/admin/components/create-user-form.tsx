"use client";

import { UserPlus, SpinnerGap } from "@phosphor-icons/react";
import { useActionState, useEffect, useState } from "react";

import type { CreateUserResult } from "@/src/features/admin/user-actions";

const initialState: CreateUserResult = {
  status: "unavailable",
  message: "",
};

export function CreateUserForm({
  deliveryAvailable,
  action,
}: {
  deliveryAvailable: boolean;
  action: (
    state: CreateUserResult,
    formData: FormData,
  ) => Promise<CreateUserResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [formDataCache, setFormDataCache] = useState<{ email?: string; password?: string } | null>(null);

  useEffect(() => {
    if (state.status === "success" && formDataCache) {
      const { email, password } = formDataCache;
      const subject = encodeURIComponent("Tài khoản truy cập KTCT Portal của bạn");
      const body = encodeURIComponent(
        `Chào bạn,\n\nTài khoản của bạn đã được tạo thành công.\n\nThông tin đăng nhập:\n- Email (tên đăng nhập): ${email}\n- Mật khẩu: ${password}\n\nVui lòng đăng nhập và đổi mật khẩu nếu cần.\n\nTrân trọng,\nBan quản trị`
      );
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      setFormDataCache(null);
    }
  }, [state.status, formDataCache]);

  return (
    <form
      className="admin-panel admin-form"
      action={(formData) => {
        setFormDataCache({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        });
        formAction(formData);
      }}
    >
      <header>
        <div>
          <p className="admin-kicker">NGƯỜI DÙNG MỚI</p>
          <h2>Thêm người dùng thủ công</h2>
        </div>
        <UserPlus size={27} weight="duotone" aria-hidden="true" />
      </header>
      {!deliveryAvailable ? (
        <p className="admin-inline-warning" role="status">
          Chưa cấu hình khóa Admin Supabase. Tính năng tạo người dùng bị khóa.
        </p>
      ) : null}
      <div className="admin-form-grid">
        <label>
          Họ tên
          <input name="full_name" required autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="text" required autoComplete="new-password" minLength={6} />
        </label>
        <label>
          Vai trò
          <select name="role" required defaultValue="student">
            <option value="student">Học viên</option>
            <option value="instructor">Giảng viên</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </label>
      </div>
      <button
        className="admin-primary-button"
        type="submit"
        disabled={!deliveryAvailable || pending}
      >
        {pending ? (
          <SpinnerGap className="admin-spin" size={19} aria-hidden="true" />
        ) : (
          <UserPlus size={19} weight="bold" aria-hidden="true" />
        )}
        {pending ? "Đang tạo…" : "Tạo & Gửi Mail"}
      </button>
      {state.message ? (
        <p
          className={`admin-action-result is-${state.status}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
