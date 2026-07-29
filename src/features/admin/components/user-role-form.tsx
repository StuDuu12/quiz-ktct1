"use client";

import { useActionState } from "react";

import type { UserRoleActionResult } from "@/src/features/admin/actions";

const initialState: UserRoleActionResult = {
  status: "idle",
  message: "",
};

export function UserRoleForm({
  userId,
  userLabel,
  role,
  action,
}: {
  userId: string;
  userLabel: string;
  role: "admin" | "instructor" | "student";
  action: (
    state: UserRoleActionResult,
    formData: FormData,
  ) => Promise<UserRoleActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <label>
        Vai trò cho {userLabel}
        <select name="role" defaultValue={role} disabled={pending}>
          <option value="student">Học viên</option>
          <option value="instructor">Giảng viên</option>
          <option value="admin">Quản trị viên</option>
        </select>
      </label>
      <button className="admin-secondary-button" type="submit" disabled={pending}>
        {pending ? "Đang cập nhật…" : "Cập nhật vai trò"}
      </button>
      {state.message ? (
        <p
          className={`admin-action-result is-${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
