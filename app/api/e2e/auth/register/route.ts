import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import { registerE2EStudent } from "@/src/e2e/store";

export async function POST(request: NextRequest) {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const input = (await request.json()) as {
    email?: string;
    password?: string;
    fullName?: string;
  };
  const result = registerE2EStudent({
    email: input.email ?? "",
    password: input.password ?? "",
    fullName: input.fullName ?? "",
  });
  return NextResponse.json(result, {
    status: result.error ? 409 : 200,
  });
}
