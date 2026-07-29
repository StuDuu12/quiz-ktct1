import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/src/lib/supabase/server", () => ({ createServerSupabaseClient }));

import {
  isOrphanJwtError,
  normalizeLoginIdentifier,
} from "@/src/features/auth/login-identifier";
import { POST } from "@/app/api/auth/login/route";

function loginRequest(identifier: string, password: string) {
  return new Request("https://quiz.example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

describe("login identifier helpers", () => {
  it("maps the admin username to the internal email address", () => {
    expect(normalizeLoginIdentifier(" admin ")).toBe("admin@ktct.example");
  });

  it("normalizes email identifiers without changing their account", () => {
    expect(normalizeLoginIdentifier("Student@Example.com")).toBe(
      "student@example.com",
    );
  });

  it("recognizes an orphaned JWT subject error", () => {
    expect(
      isOrphanJwtError({
        message: "User from sub claim in JWT does not exist",
      }),
    ).toBe(true);
  });
});

describe("POST /api/auth/login", () => {
  const signInWithPassword = vi.fn();
  const signOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword, signOut },
    });
  });

  it("authenticates the admin username through its internal email address", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });

    const response = await POST(loginRequest("admin", "1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ error: null });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "admin@ktct.example",
      password: "1",
    });
  });

  it("clears an orphaned local JWT and retries the login once", async () => {
    signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "User from sub claim in JWT does not exist" },
      })
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: null,
      });
    signOut.mockResolvedValue({ error: null });

    const response = await POST(loginRequest("student@example.com", "1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ error: null });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("preserves the cleared session cookie when the orphan-JWT retry fails", async () => {
    createServerSupabaseClient.mockImplementation(async (response) => {
      signOut.mockImplementation(async () => {
        response.cookies.set("sb-auth-token", "", {
          maxAge: 0,
          path: "/",
        });
        return { error: null };
      });
      return { auth: { signInWithPassword, signOut } };
    });
    signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "User from sub claim in JWT does not exist" },
      })
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "Invalid login credentials" },
      });

    const response = await POST(loginRequest("student@example.com", "wrong"));

    expect(response.status).toBe(401);
    expect(response.cookies.get("sb-auth-token")).toMatchObject({
      maxAge: 0,
      value: "",
    });
  });

  it("returns the Supabase error with an unauthorized status", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });

    const response = await POST(loginRequest("student@example.com", "wrong"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid login credentials",
    });
  });
});
