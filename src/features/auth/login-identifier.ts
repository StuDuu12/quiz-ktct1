import "server-only";

export const INTERNAL_ADMIN_EMAIL = "admin@ktct.example";

export function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized === "admin" ? INTERNAL_ADMIN_EMAIL : normalized;
}

export function isOrphanJwtError(
  error: { message?: string } | null | undefined,
) {
  return (
    error?.message
      ?.toLowerCase()
      .includes("user from sub claim in jwt does not exist") ?? false
  );
}
