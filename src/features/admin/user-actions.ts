"use server";

import { requireViewer } from "@/src/features/auth/session";
import { createOptionalAdminSupabaseClient } from "@/src/lib/supabase/admin";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export type CreateUserResult =
  | { status: "success"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

export async function createUserStateAction(
  _previous: CreateUserResult,
  formData: FormData,
): Promise<CreateUserResult> {
  try {
    await requireViewer(["admin"]);
    const email = z.string().trim().email().parse(formData.get("email"));
    const password = z.string().trim().min(6).parse(formData.get("password"));
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = z.enum(["student", "instructor", "admin"]).parse(formData.get("role"));
    
    const adminClient = createOptionalAdminSupabaseClient();
    if (!adminClient) {
      return { status: "unavailable", message: "Thiếu cấu hình admin. Không thể tạo người dùng." };
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, requested_role: role }
    });

    if (error || !data.user) {
      return { status: "failed", message: error?.message || "Lỗi khi tạo người dùng." };
    }

    const supabase = await createServerSupabaseClient();
    const roleRes = await supabase.rpc("admin_set_user_role", {
      target_user_id: data.user.id,
      target_role: role,
    });

    if (roleRes.error) {
      return { status: "failed", message: "Tạo tài khoản thành công nhưng không thể cấp quyền." };
    }

    revalidatePath("/admin/users");
    return { status: "success", message: "Tạo người dùng thành công." };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.",
    };
  }
}

export async function deleteUserForm(formData: FormData) {
  await requireViewer(["admin"]);
  const userId = uuidSchema.parse(formData.get("user_id"));
  const adminClient = createOptionalAdminSupabaseClient();
  if (!adminClient) {
    throw new Error("Chưa cấu hình khóa Admin Supabase.");
  }
  
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message || "Xóa người dùng thất bại.");
  
  revalidatePath("/admin/users");
}

export async function editUserForm(formData: FormData) {
  await requireViewer(["admin"]);
  const userId = uuidSchema.parse(formData.get("user_id"));
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  
  const adminClient = createOptionalAdminSupabaseClient();
  if (!adminClient) {
    throw new Error("Chưa cấu hình khóa Admin Supabase.");
  }
  
  const updates: any = { user_metadata: { full_name: fullName } };
  if (password.length >= 6) {
    updates.password = password;
  }
  
  const { error } = await adminClient.auth.admin.updateUserById(userId, updates);
  if (error) throw new Error(error.message || "Cập nhật tài khoản thất bại.");
  
  const supabase = await createServerSupabaseClient();
  const updateProfile = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (updateProfile.error) throw new Error(updateProfile.error.message || "Cập nhật hồ sơ thất bại.");
  
  revalidatePath("/admin/users");
}
