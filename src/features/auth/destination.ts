import type { AppRole } from "@/src/features/auth/roles";

export type PortalDestination = "/dashboard" | "/instructor" | "/admin";

export function portalDestinationForRole(role: AppRole): PortalDestination {
  if (role === "admin") return "/admin";
  if (role === "instructor") return "/instructor";
  return "/dashboard";
}
