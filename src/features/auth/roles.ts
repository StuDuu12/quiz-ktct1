export type AppRole = "admin" | "instructor" | "student";

export const canManageUsers = (role: AppRole) => role === "admin";

export const canManageCourse = (role: AppRole, assigned: boolean) =>
  role === "admin" || (role === "instructor" && assigned);
