import type { Metadata } from "next";

import { buildSiteMetadata } from "@/src/lib/site-metadata";
import { GlobalBackButton } from "@/src/components/global-back-button";
import { AuthWatcher } from "@/src/components/auth/auth-watcher";

import "./globals.css";

export const metadata: Metadata = buildSiteMetadata(
  process.env.NEXT_PUBLIC_SITE_URL,
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const e2eMode =
    process.env.E2E_MODE === "1" &&
    process.env.E2E_TEST_SERVER === "1" &&
    process.env.NODE_ENV !== "production";
  return (
    <html lang="vi" data-e2e-mode={e2eMode ? "true" : undefined}>
      <body>
        <AuthWatcher />
        <GlobalBackButton />
        {children}
      </body>
    </html>
  );
}
