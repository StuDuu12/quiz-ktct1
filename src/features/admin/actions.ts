import type { AppRole } from "@/src/features/auth/roles";
import { requireViewer } from "@/src/features/auth/session";
import type {
  OptionLabel,
  ParsedQuestion,
} from "@/src/features/question-bank/types";
import { createOptionalAdminSupabaseClient } from "@/src/lib/supabase/admin";
import type { Json } from "@/src/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ContentStatus = "draft" | "published" | "archived";

export type EditableQuestionOption = {
  label: OptionLabel;
  content: string;
  isCorrect: boolean;
};

export type EditableQuestion = {
  content: string;
  explanation: string;
  status: ContentStatus;
  options: EditableQuestionOption[];
};

export type AdminValidationIssue = {
  code: string;
  message: string;
};

export {
  previewImport,
  type ImportPreview,
} from "@/src/features/admin/import-preview";

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

const statusSchema = z.enum(["draft", "published", "archived"]);
const uuidSchema = z.string().uuid();
const courseSchema = z.object({
  id: uuidSchema.nullable(),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1),
  description: z.string(),
  status: statusSchema,
  coverUrl: z.string().trim().url().nullable(),
});
const chapterSchema = z.object({
  id: uuidSchema.nullable(),
  courseId: uuidSchema,
  position: z.number().int().positive(),
  title: z.string().trim().min(1),
  status: statusSchema,
});

function optionalUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalUrl(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function saveCourseForm(formData: FormData) {
  "use server";
  await requireViewer(["admin", "instructor"]);
  const input = courseSchema.parse({
    id: optionalUuid(formData.get("id")),
    slug: String(formData.get("slug") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    status: formData.get("status"),
    coverUrl: optionalUrl(formData.get("cover_url")),
  });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_upsert_course", {
    target_course_id: input.id,
    target_slug: input.slug,
    target_title: input.title,
    target_description: input.description,
    target_status: input.status,
    target_cover_url: input.coverUrl,
  });
  rpcError(error, "COURSE_SAVE_FAILED");
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/instructor");
  revalidatePath("/instructor/courses");
  void data;
}

export async function saveChapterForm(formData: FormData) {
  "use server";
  await requireViewer(["admin", "instructor"]);
  const input = chapterSchema.parse({
    id: optionalUuid(formData.get("id")),
    courseId: formData.get("course_id"),
    position: Number(formData.get("position")),
    title: formData.get("title"),
    status: formData.get("status"),
  });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_upsert_chapter", {
    target_chapter_id: input.id,
    target_course_id: input.courseId,
    target_position: input.position,
    target_title: input.title,
    target_status: input.status,
  });
  rpcError(error, "CHAPTER_SAVE_FAILED");
  revalidatePath("/admin");
  revalidatePath("/admin/courses");
  revalidatePath("/instructor");
  revalidatePath("/instructor/courses");
  void data;
}

const questionInputSchema = z.object({
  id: uuidSchema.nullable(),
  chapterId: uuidSchema,
  content: z.string().trim().min(1),
  explanation: z.string(),
  difficulty: z.number().int().min(1).max(4),
  status: statusSchema,
  sourceNumber: z.number().int().positive().nullable(),
  options: z
    .array(
      z.object({
        label: z.enum(["A", "B", "C", "D"]),
        content: z.string(),
        isCorrect: z.boolean(),
      }),
    )
    .max(4),
});

export async function saveQuestionForm(formData: FormData) {
  "use server";
  await requireViewer(["admin", "instructor"]);
  const correctLabel = String(formData.get("correct_label") ?? "");
  const input = questionInputSchema.parse({
    id: optionalUuid(formData.get("id")),
    chapterId: formData.get("chapter_id"),
    content: formData.get("content"),
    explanation: String(formData.get("explanation") ?? ""),
    difficulty: Number(formData.get("difficulty")),
    status: formData.get("status"),
    sourceNumber: formData.get("source_number")
      ? Number(formData.get("source_number"))
      : null,
    options: (["A", "B", "C", "D"] as const)
      .map((label) => ({
        label,
        content: String(formData.get(`option_${label}`) ?? ""),
        isCorrect: correctLabel === label,
      }))
      .filter((option) => option.content.trim()),
  });
  const issues = validateQuestionForStatus(input);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(" "));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_upsert_question", {
    target_question_id: input.id,
    target_chapter_id: input.chapterId,
    target_content: input.content,
    target_explanation: input.explanation,
    target_difficulty: input.difficulty,
    target_status: input.status,
    target_source_number: input.sourceNumber,
    target_options: input.options as unknown as Json,
  });
  rpcError(error, "QUESTION_SAVE_FAILED");
  revalidatePath("/admin");
  revalidatePath("/admin/questions");
  revalidatePath("/instructor");
  revalidatePath("/instructor/questions");
  void data;
}

export async function approveInstructor(
  userId: string,
  courseIds: string[],
) {
  "use server";
  await requireViewer(["admin"]);
  const targetUserId = uuidSchema.parse(userId);
  const targetCourseIds = z.array(uuidSchema).parse(courseIds);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_instructor", {
    target_user_id: targetUserId,
    target_course_ids: targetCourseIds,
    target_approved: true,
  });
  rpcError(error, "INSTRUCTOR_APPROVAL_FAILED");
  revalidatePath("/admin/users");
}

export async function approveInstructorForm(formData: FormData) {
  "use server";
  return approveInstructor(
    String(formData.get("user_id") ?? ""),
    formData.getAll("course_ids").map(String),
  );
}

export async function revokeInstructorForm(formData: FormData) {
  "use server";
  await requireViewer(["admin"]);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_instructor", {
    target_user_id: uuidSchema.parse(formData.get("user_id")),
    target_course_ids: [],
    target_approved: false,
  });
  rpcError(error, "INSTRUCTOR_REVOKE_FAILED");
  revalidatePath("/admin/users");
}

export async function setUserActiveForm(formData: FormData) {
  "use server";
  await requireViewer(["admin"]);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_set_user_active", {
    target_user_id: uuidSchema.parse(formData.get("user_id")),
    target_active: String(formData.get("active")) === "true",
  });
  rpcError(error, "USER_STATUS_SAVE_FAILED");
  revalidatePath("/admin/users");
}

export async function commitQuestionImport(input: {
  courseId: string;
  chapterId: string;
  fileName: string;
  idempotencyKey: string;
  questions: ParsedQuestion[];
}) {
  "use server";
  await requireViewer(["admin", "instructor"]);
  const parsed = z
    .object({
      courseId: uuidSchema,
      chapterId: uuidSchema,
      fileName: z.string().trim().min(1).max(200),
      idempotencyKey: z.string().trim().min(8).max(200),
      questions: z.array(z.unknown()).min(1).max(1000),
    })
    .parse(input);
  const payload = input.questions.map((question) => ({
    sourceNumber: question.sourceNumber,
    content: question.content,
    explanation: question.explanation,
    difficulty: 2,
    status: "draft",
    options: question.options.map((option) => ({
      ...option,
      isCorrect: option.label === question.correctLabel,
    })),
  }));
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_import_questions", {
    target_course_id: parsed.courseId,
    target_chapter_id: parsed.chapterId,
    target_file_name: parsed.fileName,
    target_idempotency_key: parsed.idempotencyKey,
    target_questions: payload as unknown as Json,
  });
  rpcError(error, "IMPORT_FAILED");
  revalidatePath("/admin");
  revalidatePath("/admin/questions");
  revalidatePath("/admin/import");
  revalidatePath("/instructor");
  revalidatePath("/instructor/questions");
  revalidatePath("/instructor/import");
  return data?.[0] ?? null;
}

export type InviteDeliveryResult =
  | { status: "sent"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

export async function inviteInstructor(input: {
  email: string;
  fullName: string;
  courseIds: string[];
}): Promise<InviteDeliveryResult> {
  "use server";
  await requireViewer(["admin"]);
  const parsed = z
    .object({
      email: z.string().trim().email(),
      fullName: z.string().trim().min(1),
      courseIds: z.array(uuidSchema),
    })
    .parse(input);
  const adminClient = createOptionalAdminSupabaseClient();
  if (!adminClient) {
    return {
      status: "unavailable",
      message:
        "Chưa cấu hình khóa máy chủ gửi lời mời. Không có email nào được gửi.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const request = await supabase.rpc("admin_request_invite", {
    target_email: parsed.email,
    target_full_name: parsed.fullName,
    target_course_ids: parsed.courseIds,
  });
  if (request.error || !request.data) {
    return { status: "failed", message: "Không thể tạo yêu cầu lời mời." };
  }

  const delivery = await adminClient.auth.admin.inviteUserByEmail(parsed.email, {
    data: { full_name: parsed.fullName, requested_role: "instructor" },
  });
  if (delivery.error || !delivery.data.user) {
    await supabase.rpc("admin_finalize_invite", {
      target_invite_id: request.data,
      target_status: "failed",
      target_provider_user_id: null,
      target_error_message: delivery.error?.message ?? "Invite provider failed",
    });
    return {
      status: "failed",
      message: "Nhà cung cấp email từ chối yêu cầu. Không báo gửi thành công.",
    };
  }

  const approval = await supabase.rpc("admin_set_instructor", {
    target_user_id: delivery.data.user.id,
    target_course_ids: parsed.courseIds,
    target_approved: true,
  });
  const terminal = approval.error ? "failed" : "sent";
  await supabase.rpc("admin_finalize_invite", {
    target_invite_id: request.data,
    target_status: terminal,
    target_provider_user_id: delivery.data.user.id,
    target_error_message: approval.error?.message ?? null,
  });
  if (approval.error) {
    return {
      status: "failed",
      message:
        "Email đã được nhà cung cấp tiếp nhận nhưng chưa gán được quyền. Cần kiểm tra nhật ký.",
    };
  }
  revalidatePath("/admin/users");
  return { status: "sent", message: "Đã gửi lời mời và ghi nhật ký." };
}

export async function inviteInstructorForm(formData: FormData) {
  "use server";
  return inviteInstructor({
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("full_name") ?? ""),
    courseIds: formData.getAll("course_ids").map(String),
  });
}

export async function inviteInstructorStateAction(
  _previous: InviteDeliveryResult,
  formData: FormData,
) {
  "use server";
  return inviteInstructorForm(formData);
}

export async function resendInviteForm(formData: FormData) {
  "use server";
  await requireViewer(["admin"]);
  const email = z.string().trim().email().parse(formData.get("email"));
  const supabase = await createServerSupabaseClient();
  const request = await supabase.rpc("admin_request_invite", {
    target_email: email,
    target_full_name: String(formData.get("full_name") ?? ""),
    target_course_ids: [],
  });
  rpcError(request.error, "INVITE_RESEND_REQUEST_FAILED");
  if (!request.data) throw new Error("INVITE_RESEND_REQUEST_FAILED");

  const delivery = await supabase.auth.resend({ type: "signup", email });
  const status = delivery.error ? "failed" : "sent";
  const finalized = await supabase.rpc("admin_finalize_invite", {
    target_invite_id: request.data,
    target_status: status,
    target_provider_user_id: null,
    target_error_message: delivery.error?.message ?? null,
  });
  rpcError(finalized.error, "INVITE_RESEND_AUDIT_FAILED");
  if (delivery.error) throw new Error("INVITE_RESEND_FAILED");
  revalidatePath("/admin/users");
}
