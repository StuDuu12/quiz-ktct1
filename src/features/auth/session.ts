import type { AppRole } from "@/src/features/auth/roles";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/src/lib/supabase/server";

export type Viewer = {
  id: string;
  role: AppRole;
  email: string;
};

export function assertAllowedRole(role: AppRole, allowed: AppRole[]) {
  if (!allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) return null;

  return {
    id: user.id,
    role: profile.role,
    email: profile.email || user.email || "",
  };
}

export async function requireViewer(roles?: AppRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  if (roles) assertAllowedRole(viewer.role, roles);
  return viewer;
}
