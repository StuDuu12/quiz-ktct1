import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import { expireE2EExam } from "@/src/e2e/store";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { attemptId } = await context.params;
  const ok = expireE2EExam(attemptId);

  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
