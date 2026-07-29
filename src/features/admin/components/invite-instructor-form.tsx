"use client";

import { EnvelopeSimple, SpinnerGap } from "@phosphor-icons/react";
import { useActionState } from "react";

import type { InviteDeliveryResult } from "@/src/features/admin/actions";

type CourseChoice = { id: string; title: string };

const initialState: InviteDeliveryResult = {
  status: "unavailable",
  message: "",
};

export function InviteInstructorForm({
  courses,
  deliveryAvailable,
  action,
}: {
  courses: CourseChoice[];
  deliveryAvailable: boolean;
  action: (
    state: InviteDeliveryResult,
    formData: FormData,
  ) => Promise<InviteDeliveryResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form className="admin-panel admin-form" action={formAction}>
      <header>
        <div>
          <p className="admin-kicker">LỜI MỜI GIẢNG VIÊN</p>
          <h2>Gửi lời mời mới</h2>
        </div>
        <EnvelopeSimple size={27} weight="duotone" aria-hidden="true" />
      </header>
      {!deliveryAvailable ? (
        <p className="admin-inline-warning" role="status">
          Chưa cấu hình khóa máy chủ gửi lời mời. Nút gửi bị khóa và hệ thống
          không giả lập thành công.
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
      </div>
      <fieldset>
        <legend>Phân công khóa học ban đầu</legend>
        <div className="admin-checkbox-grid">
          {courses.map((course) => (
            <label key={course.id}>
              <input type="checkbox" name="course_ids" value={course.id} />
              {course.title}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        className="admin-primary-button"
        type="submit"
        disabled={!deliveryAvailable || pending}
      >
        {pending ? (
          <SpinnerGap className="admin-spin" size={19} aria-hidden="true" />
        ) : (
          <EnvelopeSimple size={19} weight="bold" aria-hidden="true" />
        )}
        {pending ? "Đang gửi…" : "Gửi lời mời"}
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
