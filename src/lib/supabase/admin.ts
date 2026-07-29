import "next/dist/compiled/server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/src/lib/supabase/database.types";
import { getOptionalServerEnv } from "@/src/lib/server-env";

export function createOptionalAdminSupabaseClient() {
  const env = getOptionalServerEnv();
  if (!env) return null;
  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
