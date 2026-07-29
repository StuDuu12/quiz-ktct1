import { describe, expect, it } from "vitest";

import { portalDestinationForRole } from "@/src/features/auth/destination";

describe("portalDestinationForRole", () => {
  it.each([
    ["student", "/dashboard"],
    ["instructor", "/instructor"],
    ["admin", "/admin"],
  ] as const)("maps %s to %s", (role, destination) => {
    expect(portalDestinationForRole(role)).toBe(destination);
  });
});
