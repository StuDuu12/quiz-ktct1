import { describe, expect, it } from "vitest";

import { buildSiteMetadata } from "@/src/lib/site-metadata";

describe("site metadata", () => {
  it("uses the configured origin for absolute Open Graph and X images", () => {
    const metadata = buildSiteMetadata("https://quiz.example.edu/");

    expect(metadata.metadataBase?.toString()).toBe("https://quiz.example.edu/");
    expect(metadata.openGraph).toMatchObject({
      title: "Phòng luyện thi KTCT",
      images: [
        {
          url: "https://quiz.example.edu/og.png",
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://quiz.example.edu/og.png"],
    });
  });

  it("omits absolute social images until a production origin is configured", () => {
    const metadata = buildSiteMetadata(undefined);

    expect(metadata.metadataBase).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
  });

  it("rejects a configured URL that is not an origin", () => {
    expect(() =>
      buildSiteMetadata("https://quiz.example.edu/subpath"),
    ).toThrow("NEXT_PUBLIC_SITE_URL must be an absolute HTTPS origin");
  });
});
