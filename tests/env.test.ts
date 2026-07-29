import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicEnv,
  parsePublicEnv,
} from "@/src/lib/env";
import {
  getOptionalServerEnv,
} from "@/src/lib/server-env";
import { parseOptionalServerEnv } from "@/src/lib/server-env-schema";

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

  it("returns an unavailable state instead of inventing invite delivery", () => {
    expect(
      parseOptionalServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
      }),
    ).toBeNull();
  });

  it("accepts a service-role key only through the server-only variable", () => {
    expect(
      parseOptionalServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "server-secret",
      }),
    ).toEqual({
      supabaseUrl: "https://demo.supabase.co",
      serviceRoleKey: "server-secret",
    });

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-secret");
    expect(getOptionalServerEnv()).toEqual({
      supabaseUrl: "https://demo.supabase.co",
      serviceRoleKey: "server-secret",
    });
  });
});
