import { describe, expect, it } from "vitest";

import { isE2EEnabled } from "@/src/e2e/guard";

describe("E2E fixture boundary", () => {
  it("is enabled only by the explicit development test-server flag", () => {
    expect(
      isE2EEnabled({
        E2E_MODE: "1",
        E2E_TEST_SERVER: "1",
        NODE_ENV: "development",
      }),
    ).toBe(true);
    expect(
      isE2EEnabled({
        E2E_MODE: "1",
        E2E_TEST_SERVER: "0",
        NODE_ENV: "production",
      }),
    ).toBe(false);
    expect(
      isE2EEnabled({
        E2E_MODE: "1",
        E2E_TEST_SERVER: "0",
        NODE_ENV: "development",
      }),
    ).toBe(false);
    expect(
      isE2EEnabled({
        E2E_TEST_SERVER: "1",
        NODE_ENV: "development",
      }),
    ).toBe(false);
  });
});
