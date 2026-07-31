import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EXPECTED_PRODUCTION_COUNTS,
  PRODUCTION_SMOKE_ROUTES,
  classifyExistingSeedState,
  discoverMigrationFiles,
  parseProductionEnvironment,
  parseSetupEnvironment,
  summarizeSeed,
} from "@/scripts/production/lib";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("production configuration", () => {
  it("fails closed and names missing variables without exposing values", () => {
    expect(() =>
      parseProductionEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: "do-not-print-me",
      }),
    ).toThrow(
      "Missing or invalid production environment: NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });

  it("accepts an HTTPS production origin and Supabase credentials", () => {
    const parsed = parseProductionEnvironment({
      NEXT_PUBLIC_SITE_URL: "https://quiz.example.edu/",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });

    expect(parsed.siteOrigin).toBe("https://quiz.example.edu");
    expect(parsed.supabaseUrl).toBe("https://project.supabase.co");
  });

  it("requires a strong one-time administrator password without echoing it", () => {
    expect(() =>
      parseSetupEnvironment({
        NEXT_PUBLIC_SITE_URL: "https://quiz.example.edu",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        INITIAL_ADMIN_EMAIL: "admin@example.edu",
        INITIAL_ADMIN_PASSWORD: "secret",
      }),
    ).toThrow("Missing or invalid setup environment: INITIAL_ADMIN_PASSWORD");
  });

  it("keeps the committed environment template names-only", () => {
    const lines = readFileSync(
      path.join(projectRoot, ".env.example"),
      "utf8",
    )
      .trim()
      .split(/\r?\n/);

    expect(lines).toEqual([
      "NEXT_PUBLIC_SITE_URL=",
      "NEXT_PUBLIC_SUPABASE_URL=",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
      "SUPABASE_SERVICE_ROLE_KEY=",
      "INITIAL_ADMIN_EMAIL=",
      "INITIAL_ADMIN_PASSWORD=",
      "INITIAL_ADMIN_FULL_NAME=",
    ]);
  });

  it("injects public Supabase settings into the browser build", () => {
    const viteConfig = readFileSync(
      path.join(projectRoot, "vite.config.ts"),
      "utf8",
    );
    const publicEnvSource = readFileSync(
      path.join(projectRoot, "src", "lib", "env.ts"),
      "utf8",
    );

    expect(viteConfig).toContain(
      '"process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(',
    );
    expect(viteConfig).toContain(
      '"process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(',
    );
    expect(publicEnvSource).toMatch(
      /NEXT_PUBLIC_SUPABASE_URL:\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(publicEnvSource).toMatch(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY:\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("keeps a clean-build regression for the generated Worker secret contract", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    const verifier = readFileSync(
      path.join(
        projectRoot,
        "scripts",
        "production",
        "verify-generated-wrangler.mjs",
      ),
      "utf8",
    );

    expect(packageJson.scripts["test:generated-config"]).toBe(
      "node scripts/production/verify-generated-wrangler.mjs",
    );
    expect(verifier).toContain('await rm(distDirectory, { recursive: true, force: true })');
    expect(verifier).toContain('"SUPABASE_SERVICE_ROLE_KEY"');
    expect(verifier).not.toContain("service_role_key=");
  });

  it("inlines SSR route chunks so free-tier requests do not compile them lazily", () => {
    const viteConfig = readFileSync(
      path.join(projectRoot, "vite.config.ts"),
      "utf8",
    );

    expect(viteConfig).toContain("codeSplitting: false");
  });

  it("discovers every SQL migration in strict filename order", () => {
    const migrations = discoverMigrationFiles(projectRoot);

    expect(migrations.length).toBeGreaterThanOrEqual(15);
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations
        .map((migration) => migration.version)
        .toSorted((left, right) => left.localeCompare(right)),
    );
  });

  it("verifies the deterministic seed has the exact production counts", () => {
    expect(summarizeSeed(projectRoot)).toEqual(EXPECTED_PRODUCTION_COUNTS);
  });

  it("resumes a fully inserted seed when publication did not complete", () => {
    expect(
      classifyExistingSeedState({
        rawCounts: {
          courses: 1,
          chapters: 6,
          questions: 497,
          questionOptions: 1_988,
        },
        publishedQuestionOptions: 0,
        actualQuestions: [{ id: "question-1", fingerprint: "expected" }],
        expectedQuestions: [{ id: "question-1", fingerprint: "expected" }],
        actualOptions: [{ id: "option-1", fingerprint: "expected" }],
        expectedOptions: [{ id: "option-1", fingerprint: "expected" }],
      }),
    ).toBe("resume");
  });

  it("rejects same-count seed data with an unexpected deterministic identity", () => {
    expect(() =>
      classifyExistingSeedState({
        rawCounts: {
          courses: 1,
          chapters: 6,
          questions: 497,
          questionOptions: 1_988,
        },
        publishedQuestionOptions: 1_988,
        actualQuestions: [{ id: "foreign-question", fingerprint: "foreign" }],
        expectedQuestions: [{ id: "question-1", fingerprint: "expected" }],
        actualOptions: [{ id: "option-1", fingerprint: "expected" }],
        expectedOptions: [{ id: "option-1", fingerprint: "expected" }],
      }),
    ).toThrow("Production database contains unexpected questions");
  });

  it("rejects matching identities whose stored seed content drifted", () => {
    expect(() =>
      classifyExistingSeedState({
        rawCounts: {
          courses: 1,
          chapters: 6,
          questions: 497,
          questionOptions: 1_988,
        },
        publishedQuestionOptions: 1_988,
        actualQuestions: [{ id: "question-1", fingerprint: "changed" }],
        expectedQuestions: [{ id: "question-1", fingerprint: "expected" }],
        actualOptions: [{ id: "option-1", fingerprint: "expected" }],
        expectedOptions: [{ id: "option-1", fingerprint: "expected" }],
      }),
    ).toThrow("Production database contains unexpected questions");
  });

  it("treats a matching fully published deterministic seed as complete", () => {
    expect(
      classifyExistingSeedState({
        rawCounts: {
          courses: 1,
          chapters: 6,
          questions: 497,
          questionOptions: 1_988,
        },
        publishedQuestionOptions: 1_988,
        actualQuestions: [{ id: "question-1", fingerprint: "expected" }],
        expectedQuestions: [{ id: "question-1", fingerprint: "expected" }],
        actualOptions: [{ id: "option-1", fingerprint: "expected" }],
        expectedOptions: [{ id: "option-1", fingerprint: "expected" }],
      }),
    ).toBe("complete");
  });

  it("defines smoke checks for public, auth, protected, and admin routes", () => {
    expect(PRODUCTION_SMOKE_ROUTES.map((route) => route.path)).toEqual([
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/auth/callback",
      "/dashboard",
      "/history",
      "/admin",
    ]);
  });
});
