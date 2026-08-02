import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("App Router ESLint configuration", () => {
  it("does not search for a Pages Router directory when linting from a feature folder", () => {
    const projectRoot = path.resolve(import.meta.dirname, "..");
    const featureDirectory = path.join(
      projectRoot,
      "src",
      "features",
      "practice",
    );
    const eslintBinary = path.join(
      projectRoot,
      "node_modules",
      "eslint",
      "bin",
      "eslint.js",
    );

    const result = spawnSync(
      process.execPath,
      [eslintBinary, "components/practice-launch-form.tsx"],
      {
        cwd: featureDirectory,
        encoding: "utf8",
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status).toBe(0);
    expect(output).not.toContain("Pages directory cannot be found");
  });
});
