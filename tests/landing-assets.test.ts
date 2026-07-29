import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const variants = [
  { file: "ktct-study-hero-480.webp", maxBytes: 70_000 },
  { file: "ktct-study-hero-768.webp", maxBytes: 120_000 },
  { file: "ktct-study-hero-1152.webp", maxBytes: 210_000 },
  { file: "ktct-study-hero-1536.webp", maxBytes: 320_000 },
] as const;

describe("landing hero assets", () => {
  it.each(variants)(
    "ships $file as a compressed WebP within its transfer budget",
    async ({ file, maxBytes }) => {
      const assetPath = path.resolve("public/images", file);
      const [asset, info] = await Promise.all([
        readFile(assetPath),
        stat(assetPath),
      ]);

      expect(asset.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(info.size).toBeGreaterThan(1_000);
      expect(info.size).toBeLessThanOrEqual(maxBytes);
    },
  );

  it("keeps the approved PNG as a non-empty fallback", async () => {
    const info = await stat(
      path.resolve("public/images/ktct-study-hero.png"),
    );

    expect(info.size).toBeGreaterThan(1_000);
    expect(info.size).toBeLessThan(2_100_000);
  });
});
