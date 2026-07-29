import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import { confirmE2EEmail } from "@/src/e2e/store";

export async function GET(request: NextRequest) {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const confirmed = confirmE2EEmail(url.searchParams.get("email") ?? "");
  return NextResponse.redirect(
    new URL(confirmed ? "/login?confirmed=1" : "/register", url.origin),
  );
}
