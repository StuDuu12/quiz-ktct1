import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("learner dashboard responsive chapter details", () => {
  it("keeps labelled accuracy and latest-attempt data available on narrow layouts", async () => {
    const [component, styles] = await Promise.all([
      readFile(path.resolve("src/features/catalog/components/chapter-row.tsx"), "utf8"),
      readFile(path.resolve("app/globals.css"), "utf8"),
    ]);

    expect(component).toContain("Độ chính xác");
    expect(component).toContain("Lần gần nhất");
    expect(styles).not.toMatch(/\.chapter-metric,\s*\.chapter-latest\s*\{\s*display:\s*none/);
  });
});
