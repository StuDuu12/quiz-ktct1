import { describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, redirect } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/src/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("next/navigation", () => ({ redirect }));

import {
  assertAllowedRole,
  getViewer,
  requireViewer,
} from "@/src/features/auth/session";

function serverClientForProfile(profile: {
  email: string;
  role: "admin" | "instructor" | "student";
  is_active: boolean;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "viewer-1", email: "auth@example.com" } },
        error: null,
      }),
    },
    from: vi.fn(() => ({ select })),
  };
}

describe("assertAllowedRole", () => {
  it("allows an instructor on an instructor route", () => {
    expect(() =>
      assertAllowedRole("instructor", ["admin", "instructor"]),
    ).not.toThrow();
  });

  it("rejects a student on an admin-only route", () => {
    expect(() => assertAllowedRole("student", ["admin"])).toThrow(
      "FORBIDDEN",
    );
  });

  it("returns an active profile as the viewer", async () => {
    createServerSupabaseClient.mockResolvedValue(
      serverClientForProfile({
        email: "student@example.com",
        role: "student",
        is_active: true,
      }),
    );

    await expect(getViewer()).resolves.toEqual({
      id: "viewer-1",
      role: "student",
      email: "student@example.com",
    });
  });

  it("does not expose an inactive profile as a viewer", async () => {
    createServerSupabaseClient.mockResolvedValue(
      serverClientForProfile({
        email: "inactive@example.com",
        role: "student",
        is_active: false,
      }),
    );

    await expect(getViewer()).resolves.toBeNull();
  });

  it("redirects a signed-out visitor to login", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    await expect(requireViewer()).rejects.toThrow("REDIRECT:/login");
  });
});
