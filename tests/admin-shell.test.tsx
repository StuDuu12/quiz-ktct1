import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminShell", () => {
  it("keeps the learner-view link for administrators", () => {
    const adminShellSource = readFileSync(
      resolve("src/features/admin/components/admin-shell.tsx"),
      "utf8",
    );

    expect(adminShellSource).toContain('href="/dashboard"');
  });
});
