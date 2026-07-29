import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv, parsePublicEnv } from "@/src/lib/env";

describe("public Supabase environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an incomplete Supabase configuration", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "" })).toThrow(
      "Supabase environment is incomplete",
    );
  });

  it("returns a validated public configuration", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      supabaseUrl: "https://demo.supabase.co",
      supabaseAnonKey: "anon-key",
    });
  });

  it("reads validated public configuration from the process environment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(getPublicEnv()).toEqual({
      supabaseUrl: "https://demo.supabase.co",
      supabaseAnonKey: "anon-key",
    });
  });
});
