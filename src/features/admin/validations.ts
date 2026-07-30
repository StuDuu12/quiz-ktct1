import type { AppRole } from "@/src/features/auth/roles";
import type { EditableQuestion, AdminValidationIssue } from "@/src/features/admin/actions";

export function assertUserAdministrationRole(role: AppRole) {
  if (role !== "admin") throw new Error("FORBIDDEN");
}

export function assertCourseManagementScope({
  actorRole,
  courseId,
  assignedCourseIds,
}: {
  actorRole: AppRole;
  courseId: string;
  assignedCourseIds: string[];
}) {
  if (
    actorRole !== "admin" &&
    (actorRole !== "instructor" || !assignedCourseIds.includes(courseId))
  ) {
    throw new Error("FORBIDDEN");
  }
}

export function validateQuestionForStatus(
  question: EditableQuestion,
): AdminValidationIssue[] {
  const issues: AdminValidationIssue[] = [];
  if (!question.content.trim()) {
    issues.push({
      code: "missing-content",
      message: "Nội dung câu hỏi không được để trống.",
    });
  }
  if (question.status !== "published") return issues;

  const labels = question.options.map((option) => option.label);
  const hasExactlyFour =
    question.options.length === 4 &&
    ["A", "B", "C", "D"].every(
      (label) =>
        labels.filter((candidate) => candidate === label).length === 1 &&
        question.options.find((option) => option.label === label)?.content.trim(),
    );
  if (!hasExactlyFour) {
    issues.push({
      code: "exactly-four-options",
      message: "Câu xuất bản phải có đúng bốn phương án A–D.",
    });
  }
  if (question.options.filter((option) => option.isCorrect).length !== 1) {
    issues.push({
      code: "exactly-one-correct",
      message: "Câu xuất bản phải có đúng một đáp án đúng.",
    });
  }
  if (!question.explanation.trim()) {
    issues.push({
      code: "missing-explanation",
      message: "Câu xuất bản phải có lời giải.",
    });
  }
  return issues;
}
