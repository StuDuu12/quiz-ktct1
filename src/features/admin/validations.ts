import type { AppRole } from "@/src/features/auth/roles";
import type { EditableQuestion, AdminValidationIssue } from "@/src/features/admin/actions";

export function assertUserAdministrationRole(role: AppRole) {
  if (role !== "admin") throw new Error("FORBIDDEN");
}

export function assertCourseManagementScope({
  role,
  courseId,
  allowedCourseIds,
}: {
  role: AppRole;
  courseId: string;
  allowedCourseIds: string[];
}) {
  if (role === "admin") return;
  if (role === "instructor" && allowedCourseIds.includes(courseId)) return;
  throw new Error("FORBIDDEN");
}

export function validateQuestionForStatus(
  question: EditableQuestion,
): AdminValidationIssue[] {
  const issues: AdminValidationIssue[] = [];
  if (!question.content.trim()) {
    issues.push({ path: ["content"], message: "Nội dung câu hỏi không được để trống" });
  }
  if (question.options.length < 2) {
    issues.push({ path: ["options"], message: "Cần ít nhất 2 lựa chọn" });
  }
  const correctCount = question.options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    issues.push({
      path: ["options"],
      message: "Cần chọn đúng 1 đáp án đúng",
    });
  }
  for (let i = 0; i < question.options.length; i++) {
    if (!question.options[i].content.trim()) {
      issues.push({
        path: ["options", i, "content"],
        message: "Nội dung lựa chọn không được để trống",
      });
    }
  }
  return issues;
}
