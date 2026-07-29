import type { Metadata } from "next";

export const SITE_TITLE = "Ôn thi Kinh tế chính trị Mác - Lênin";
export const SITE_DESCRIPTION =
  "Luyện theo 6 chương, thi thử 40 câu trong 60 phút và lưu lại toàn bộ tiến độ học tập.";

function parseSiteOrigin(value: string | undefined): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute HTTPS origin");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute HTTPS origin");
  }

  return url.origin;
}

export function buildSiteMetadata(siteUrl: string | undefined): Metadata {
  const origin = parseSiteOrigin(siteUrl);
  const imageUrl = origin ? `${origin}/og.png` : null;

  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      locale: "vi_VN",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      ...(origin
        ? {
            url: origin,
            images: [
              {
                url: imageUrl!,
                width: 1200,
                height: 630,
                alt: SITE_TITLE,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}
