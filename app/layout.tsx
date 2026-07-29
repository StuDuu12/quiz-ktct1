import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { buildSiteMetadata } from "@/src/lib/site-metadata";

import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-be-vietnam-pro",
});

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
      <body className={beVietnamPro.variable}>{children}</body>
    </html>
  );
}
