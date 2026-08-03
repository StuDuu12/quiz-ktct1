import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ExamSessionLoading from "@/app/(protected)/exam/[attemptId]/loading";
import MockExamLaunchLoading from "@/app/(protected)/courses/[courseSlug]/mock-exam/loading";

describe("mock exam route loading", () => {
  it("announces preparation while the launch route loads", () => {
    const markup = renderToStaticMarkup(<MockExamLaunchLoading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Đang chuẩn bị thi thử");
    expect(markup).toContain("Đang tải cấu hình đề thi");
  });

  it("announces question loading while entering an exam session", () => {
    const markup = renderToStaticMarkup(<ExamSessionLoading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Đang mở đề thi");
    expect(markup).toContain("Đang tải 40 câu hỏi");
  });
});
