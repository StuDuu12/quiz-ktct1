import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import {
  authenticateE2EUser,
  E2E_SESSION_COOKIE,
} from "@/src/e2e/store";

export async function POST(request: NextRequest) {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const input = (await request.json()) as {
    email?: string;
    password?: string;
  };
  const result = authenticateE2EUser(
    input.email ?? "",
    input.password ?? "",
  );
  if (!result.user) {
    return NextResponse.json(
      { error: result.error },
      { status: 401 },
    );
  }
  const response = NextResponse.json({ error: null });
  response.cookies.set(E2E_SESSION_COOKIE, result.user.id, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
