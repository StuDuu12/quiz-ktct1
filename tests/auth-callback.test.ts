import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/auth/callback/route";

const origin = "https://quiz.example.com";

async function redirectLocation(next: string) {
  const request = new NextRequest(
    `${origin}/auth/callback?${new URLSearchParams({ next })}`,
  );
  const response = await GET(request);
  return response.headers.get("location");
}

describe("Supabase auth callback redirects", () => {
  it("rejects an absolute external destination", async () => {
    await expect(redirectLocation("https://evil.example")).resolves.toBe(
      `${origin}/`,
    );
  });

  it("rejects a protocol-relative external destination", async () => {
    await expect(redirectLocation("//evil.example")).resolves.toBe(
      `${origin}/`,
    );
  });

  it("rejects a backslash-prefixed authority destination", async () => {
    await expect(redirectLocation("/\\evil.example")).resolves.toBe(
      `${origin}/`,
    );
  });

  it("preserves a valid same-origin relative destination", async () => {
    await expect(
      redirectLocation("/dashboard?tab=attempts#results"),
    ).resolves.toBe(`${origin}/dashboard?tab=attempts#results`);
  });
});
