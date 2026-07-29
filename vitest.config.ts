import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "next/dist/compiled/server-only": path.resolve(
        import.meta.dirname,
        "tests/server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "node",
  },
});
