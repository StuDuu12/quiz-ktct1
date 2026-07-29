import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const weights = [400, 500, 600, 700, 800] as const;
const subsets = ["latin", "vietnamese"] as const;

describe("self-hosted Be Vietnam Pro", () => {
  it.each(weights.flatMap((weight) => subsets.map((subset) => ({ weight, subset }))))(
    "ships the $weight $subset WOFF2 asset",
    async ({ weight, subset }) => {
      const fontPath = path.resolve(
        "public/fonts",
        `be-vietnam-pro-${weight}-${subset}.woff2`,
      );
      const [font, info] = await Promise.all([readFile(fontPath), stat(fontPath)]);

      expect(font.subarray(0, 4).toString("ascii")).toBe("wOF2");
      expect(info.size).toBeGreaterThan(4_000);
      expect(info.size).toBeLessThan(30_000);
    },
  );

  it("declares all browser-addressable weights with swap and no next/font import", async () => {
    const [styles, layout] = await Promise.all([
      readFile(path.resolve("app/globals.css"), "utf8"),
      readFile(path.resolve("app/layout.tsx"), "utf8"),
    ]);

    expect(layout).not.toContain("next/font");
    expect(styles).toContain("--font-be-vietnam-pro: \"Be Vietnam Pro\"");

    for (const weight of weights) {
      expect(styles).toContain(`font-weight: ${weight}`);
      expect(styles).toContain(
        `/fonts/be-vietnam-pro-${weight}-vietnamese.woff2`,
      );
      expect(styles).toContain(`/fonts/be-vietnam-pro-${weight}-latin.woff2`);
    }

    expect(styles.match(/font-display:\s*swap/g)).toHaveLength(10);
  });
});
