import { NextResponse } from "next/server";

import {
  isOrphanJwtError,
  normalizeLoginIdentifier,
} from "@/src/features/auth/login-identifier";
import { portalDestinationForRole } from "@/src/features/auth/destination";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

type LoginRequest = {
  identifier: string;
  password: string;
};

function jsonWithResponseCookies(
  response: NextResponse,
  body: object,
  init?: ResponseInit,
) {
  const output = NextResponse.json(body, init);
  for (const cookie of response.cookies.getAll()) {
    output.cookies.set(cookie);
  }
  return output;
}

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
    return jsonWithResponseCookies(
      response,
      { error: result.error.message },
      { status: 401 },
    );
  }

  const userId = result.data.user?.id;
  if (!userId) {
    return jsonWithResponseCookies(
      response,
      { error: "Không xác định được người dùng." },
      { status: 403 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return jsonWithResponseCookies(
      response,
      { error: "Không tìm thấy hồ sơ người dùng." },
      { status: 403 },
    );
  }

  if (!profile.is_active) {
    return jsonWithResponseCookies(
      response,
      { error: "Tài khoản đã bị vô hiệu hóa." },
      { status: 403 },
    );
  }

  return jsonWithResponseCookies(response, {
    error: null,
    role: profile.role,
    destination: portalDestinationForRole(profile.role),
  });
}
