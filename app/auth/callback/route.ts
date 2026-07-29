import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/src/lib/supabase/server";

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destination = safeDestination(url.searchParams.get("next"));
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
