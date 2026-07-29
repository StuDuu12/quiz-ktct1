import { z } from "zod";

const optionalServerSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function parseOptionalServerEnv(
  input: Record<string, string | undefined>,
) {
  const result = optionalServerSchema.safeParse(input);
  if (!result.success) return null;
  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}
