import { NextResponse } from "next/server";

import {
  isOrphanJwtError,
  normalizeLoginIdentifier,
} from "@/src/features/auth/login-identifier";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type LoginRequest = {
  identifier: string;
  password: string;
};

export async function POST(request: Request) {
  const { identifier, password } = (await request.json()) as LoginRequest;
  const response = NextResponse.json({ error: null });
  const supabase = await createServerSupabaseClient(response);
  const credentials = {
    email: normalizeLoginIdentifier(identifier),
    password,
  };

  let result = await supabase.auth.signInWithPassword(credentials);

  if (isOrphanJwtError(result.error)) {
    await supabase.auth.signOut({ scope: "local" });
    result = await supabase.auth.signInWithPassword(credentials);
  }

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 401 },
    );
  }

  return response;
}
