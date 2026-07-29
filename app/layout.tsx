import type { Metadata } from "next";

import { buildSiteMetadata } from "@/src/lib/site-metadata";

import "./globals.css";

export const metadata: Metadata = buildSiteMetadata(
  process.env.NEXT_PUBLIC_SITE_URL,
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
