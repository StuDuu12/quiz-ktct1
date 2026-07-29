import { describe, expect, it } from "vitest";
import {
  canManageCourse,
  canManageUsers,
} from "@/src/features/auth/roles";

describe("role policy", () => {
  it("allows only admins to manage users", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("instructor")).toBe(false);
    expect(canManageUsers("student")).toBe(false);
  });

  it("limits instructors to assigned courses", () => {
    expect(canManageCourse("admin", false)).toBe(true);
    expect(canManageCourse("instructor", true)).toBe(true);
    expect(canManageCourse("instructor", false)).toBe(false);
    expect(canManageCourse("student", true)).toBe(false);
  });
});
