import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/src/lib/supabase/server";

function safeDestination(value: string | null, origin: string) {
  if (!value || value.includes("\\")) {
    return "/";
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destination = safeDestination(url.searchParams.get("next"), url.origin);
  const response = NextResponse.redirect(new URL(destination, url.origin));
  const code = url.searchParams.get("code");

  if (!code) return response;

  const supabase = await createServerSupabaseClient(response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return response;

  const failedDestination =
    destination === "/reset-password"
      ? "/reset-password?error=expired-reset"
      : "/login?error=confirmation";
  return NextResponse.redirect(new URL(failedDestination, url.origin));
}
