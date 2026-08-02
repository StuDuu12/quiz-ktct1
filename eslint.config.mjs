import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This project uses the App Router only. The Pages Router rule resolves
    // `pages` relative to the current working directory and emits a false
    // configuration error when ESLint is launched from a feature folder.
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".worktrees/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
