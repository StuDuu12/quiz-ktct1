import { NextRequest, NextResponse } from "next/server";

import { isE2EEnabled } from "@/src/e2e/guard";
import {
  E2E_SESSION_COOKIE,
  getE2EViewer,
  saveE2EQuestion,
} from "@/src/e2e/store";

export async function POST(request: NextRequest) {
  if (!isE2EEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const viewer = getE2EViewer(request.cookies.get(E2E_SESSION_COOKIE)?.value);
  if (!viewer) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const input = (await request.json()) as {
    chapterId?: string;
    content?: string;
  };
  try {
    const id = saveE2EQuestion(viewer, {
      id: null,
      chapterId: input.chapterId ?? "e2e-unassigned-chapter-1",
      content: input.content ?? "Câu hỏi ngoài phạm vi phân công",
      explanation: "",
      difficulty: 2,
      status: "draft",
      sourceNumber: 999,
      options: [
        { label: "A", content: "Phương án A", isCorrect: true },
        { label: "B", content: "Phương án B", isCorrect: false },
        { label: "C", content: "Phương án C", isCorrect: false },
        { label: "D", content: "Phương án D", isCorrect: false },
      ],
    });
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    throw error;
  }
}
