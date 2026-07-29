// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAdminCatalog, getAdminUsers, requireViewer } = vi.hoisted(() => ({
  getAdminCatalog: vi.fn(),
  getAdminUsers: vi.fn(),
  requireViewer: vi.fn(),
}));

vi.mock("@/src/features/admin/actions", () => ({
  approveInstructorForm: vi.fn(),
  inviteInstructorStateAction: vi.fn(),
  resendInviteForm: vi.fn(),
  revokeInstructorForm: vi.fn(),
  setUserActiveForm: vi.fn(),
  setUserRoleForm: vi.fn(),
  setUserRoleStateAction: vi.fn(),
}));
vi.mock("@/src/features/admin/components/invite-instructor-form", () => ({
  InviteInstructorForm: () => <div>Invite form</div>,
}));
vi.mock("@/src/features/admin/queries", () => ({ getAdminCatalog, getAdminUsers }));
vi.mock("@/src/features/auth/session", () => ({ requireViewer }));
vi.mock("@/src/lib/server-env", () => ({ getOptionalServerEnv: vi.fn() }));

import AdminUsersPage from "@/app/(admin)/admin/users/page";
import { UserRoleForm } from "@/src/features/admin/components/user-role-form";

afterEach(cleanup);

describe("AdminUsersPage", () => {
  it("offers each user a labelled role choice and a submit control", async () => {
    requireViewer.mockResolvedValue(undefined);
    getAdminUsers.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000777",
        fullName: "Role target",
        email: "target@example.test",
        role: "student",
        isActive: true,
        assignedCourseIds: [],
      },
    ]);
    getAdminCatalog.mockResolvedValue({ courses: [] });

    render(await AdminUsersPage());

    expect(screen.getByLabelText("Vai trò cho Role target")).toHaveValue("student");
    expect(screen.getByRole("option", { name: "Học viên" })).toHaveValue("student");
    expect(screen.getByRole("option", { name: "Giảng viên" })).toHaveValue("instructor");
    expect(screen.getByRole("option", { name: "Quản trị viên" })).toHaveValue("admin");
    expect(screen.getByRole("button", { name: "Cập nhật vai trò" })).toBeInTheDocument();
  });
});

describe("UserRoleForm", () => {
  it("renders accessible server feedback beside the role controls", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "error",
      message: "At least one active admin must remain",
    });
    render(
      <UserRoleForm
        userId="00000000-0000-4000-8000-000000000777"
        userLabel="Role target"
        role="student"
        action={action}
      />,
    );

    fireEvent.submit(screen.getByRole("button", { name: "Cập nhật vai trò" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "At least one active admin must remain",
    );
  });
});
