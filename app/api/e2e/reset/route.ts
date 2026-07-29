import { NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import {
  E2E_SESSION_COOKIE,
  resetE2EStore,
} from "@/src/e2e/store";

export async function POST() {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  resetE2EStore();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(E2E_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
