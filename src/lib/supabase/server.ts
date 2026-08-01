import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/src/lib/supabase/database.types";
import { getPublicEnv } from "@/src/lib/env";

type CookieWriter = {
  cookies: {
    set: (name: string, value: string, options: Record<string, unknown>) => void;
  };
  headers: Headers;
};

export async function createServerSupabaseClient(response?: CookieWriter) {
  const cookieStore = await cookies();
  const { supabaseAnonKey, supabaseUrl } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
            response?.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) {
            response?.headers.set(name, value);
          }
        } catch {
          // Server Components cannot mutate cookies; route handlers pass a response.
        }
      },
    },
  });
}
