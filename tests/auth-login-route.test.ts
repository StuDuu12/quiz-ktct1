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
  const from = vi.fn();
  const select = vi.fn();
  const eq = vi.fn();
  const maybeSingle = vi.fn();
  const signInWithPassword = vi.fn();
  const signOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({
      data: { role: "admin", is_active: true },
      error: null,
    });
    eq.mockReturnValue({ maybeSingle });
    select.mockReturnValue({ eq });
    from.mockReturnValue({ select });
    createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword, signOut },
      from,
    });
  });

  it("authenticates the admin username through its internal email address", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: { id: "admin-id" } },
      error: null,
    });

    const response = await POST(loginRequest("admin", "1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      error: null,
      role: "admin",
      destination: "/admin",
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "admin@ktct.example",
      password: "1",
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("role,is_active");
    expect(eq).toHaveBeenCalledWith("id", "admin-id");
  });

  it("clears an orphaned local JWT and retries the login once", async () => {
    signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "User from sub claim in JWT does not exist" },
      })
      .mockResolvedValueOnce({
        data: { session: null, user: { id: "student-id" } },
        error: null,
      });
    maybeSingle.mockResolvedValue({
      data: { role: "student", is_active: true },
      error: null,
    });
    signOut.mockResolvedValue({ error: null });

    const response = await POST(loginRequest("student@example.com", "1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      error: null,
      role: "student",
      destination: "/dashboard",
    });
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
      return { auth: { signInWithPassword, signOut }, from };
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

  it("rejects a successful authentication without a profile", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: { id: "missing-profile" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(loginRequest("student@example.com", "1"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.any(String) });
    expect(body).not.toHaveProperty("destination");
  });

  it("rejects a successful authentication with an inactive profile", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: { id: "inactive-profile" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({
      data: { role: "student", is_active: false },
      error: null,
    });

    const response = await POST(loginRequest("student@example.com", "1"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.any(String) });
    expect(body).not.toHaveProperty("destination");
  });
});
