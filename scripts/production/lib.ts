import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const EXPECTED_PRODUCTION_COUNTS = {
  courses: 1,
  chapters: 6,
  questions: 497,
  publishedQuestionOptions: 1_988,
} as const;

export const PRODUCTION_SMOKE_ROUTES = [
  { path: "/", access: "public" },
  { path: "/login", access: "public" },
  { path: "/register", access: "public" },
  { path: "/forgot-password", access: "public" },
  { path: "/reset-password", access: "public" },
  { path: "/auth/callback", access: "redirect" },
  { path: "/dashboard", access: "protected" },
  { path: "/history", access: "protected" },
  { path: "/admin", access: "protected" },
] as const;

export type ProductionEnvironment = {
  siteOrigin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
};

export type SetupEnvironment = ProductionEnvironment & {
  initialAdminEmail: string;
  initialAdminPassword: string;
  initialAdminFullName: string;
};

function httpsOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseProductionEnvironment(
  input: Record<string, string | undefined>,
): ProductionEnvironment {
  const siteOrigin = httpsOrigin(input.NEXT_PUBLIC_SITE_URL);
  const supabaseUrl = httpsOrigin(input.NEXT_PUBLIC_SUPABASE_URL);
  const missingOrInvalid = [
    !siteOrigin && "NEXT_PUBLIC_SITE_URL",
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !input.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !input.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missingOrInvalid.length) {
    throw new Error(
      `Missing or invalid production environment: ${missingOrInvalid.join(", ")}`,
    );
  }

  return {
    siteOrigin: siteOrigin!,
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: input.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    serviceRoleKey: input.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  };
}

export function parseSetupEnvironment(
  input: Record<string, string | undefined>,
): SetupEnvironment {
  const runtime = parseProductionEnvironment(input);
  const email = input.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = input.INITIAL_ADMIN_PASSWORD;
  const missingOrInvalid = [
    !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      ? "INITIAL_ADMIN_EMAIL"
      : null,
    !password || password.length < 12 ? "INITIAL_ADMIN_PASSWORD" : null,
  ].filter(Boolean);

  if (missingOrInvalid.length) {
    throw new Error(
      `Missing or invalid setup environment: ${missingOrInvalid.join(", ")}`,
    );
  }

  return {
    ...runtime,
    initialAdminEmail: email!,
    initialAdminPassword: password!,
    initialAdminFullName:
      input.INITIAL_ADMIN_FULL_NAME?.trim() || "Quản trị viên",
  };
}

export type MigrationFile = {
  name: string;
  version: string;
  absolutePath: string;
};

export function discoverMigrationFiles(projectRoot: string): MigrationFile[] {
  const directory = path.join(projectRoot, "supabase", "migrations");
  const migrations = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d{12})_[a-z0-9_]+\.sql$/.exec(name);
      if (!match) throw new Error(`Invalid migration filename: ${name}`);
      return {
        name,
        version: match[1],
        absolutePath: path.join(directory, name),
      };
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));

  if (!migrations.length) throw new Error("No production migrations found");
  if (new Set(migrations.map(({ version }) => version)).size !== migrations.length) {
    throw new Error("Duplicate production migration version");
  }
  return migrations;
}

export type DeterministicSeedRow = {
  id: string;
  fingerprint: string;
  metadataFingerprint?: string;
};

type ExistingSeedState = {
  rawCounts: {
    courses: number;
    chapters: number;
    questions: number;
    questionOptions: number;
  };
  publishedQuestionOptions: number;
  actualQuestions: DeterministicSeedRow[];
  expectedQuestions: DeterministicSeedRow[];
  actualOptions: DeterministicSeedRow[];
  expectedOptions: DeterministicSeedRow[];
};

function assertExpectedRows(
  actual: DeterministicSeedRow[],
  expected: DeterministicSeedRow[],
  label: "questions" | "question options",
) {
  const expectedById = new Map(
    expected.map(({ id, fingerprint }) => [id, fingerprint]),
  );
  if (
    actual.length > expected.length ||
    actual.some(
      ({ id, fingerprint }) => expectedById.get(id) !== fingerprint,
    )
  ) {
    throw new Error(`Production database contains unexpected ${label}`);
  }
}

export function classifyExistingSeedState({
  rawCounts,
  publishedQuestionOptions,
  actualQuestions,
  expectedQuestions,
  actualOptions,
  expectedOptions,
}: ExistingSeedState): "complete" | "resume" {
  if (
    rawCounts.courses > EXPECTED_PRODUCTION_COUNTS.courses ||
    rawCounts.chapters > EXPECTED_PRODUCTION_COUNTS.chapters ||
    rawCounts.questions > EXPECTED_PRODUCTION_COUNTS.questions ||
    rawCounts.questionOptions >
      EXPECTED_PRODUCTION_COUNTS.publishedQuestionOptions
  ) {
    throw new Error(
      "Production database contains unexpected content; seed stopped",
    );
  }

  assertExpectedRows(actualQuestions, expectedQuestions, "questions");
  assertExpectedRows(actualOptions, expectedOptions, "question options");

  const rawCountsComplete =
    rawCounts.courses === EXPECTED_PRODUCTION_COUNTS.courses &&
    rawCounts.chapters === EXPECTED_PRODUCTION_COUNTS.chapters &&
    rawCounts.questions === EXPECTED_PRODUCTION_COUNTS.questions &&
    rawCounts.questionOptions ===
      EXPECTED_PRODUCTION_COUNTS.publishedQuestionOptions;
  const identitiesComplete =
    actualQuestions.length === expectedQuestions.length &&
    actualOptions.length === expectedOptions.length;
  const expectedQuestionMetadata = new Map(
    expectedQuestions.map(({ id, metadataFingerprint }) => [
      id,
      metadataFingerprint,
    ]),
  );
  const metadataComplete = actualQuestions.every(
    ({ id, metadataFingerprint }) =>
      metadataFingerprint === expectedQuestionMetadata.get(id),
  );

  return rawCountsComplete &&
    identitiesComplete &&
    metadataComplete &&
    publishedQuestionOptions ===
      EXPECTED_PRODUCTION_COUNTS.publishedQuestionOptions
    ? "complete"
    : "resume";
}

type SeedOption = {
  label: string;
  content: string;
};

export type SeedQuestion = {
  chapter: number;
  practicePosition: number;
  sourceNumber: number;
  content: string;
  explanation: string;
  correctLabel: string;
  options: SeedOption[];
};

export function readAndValidateSeed(projectRoot: string): SeedQuestion[] {
  const raw = JSON.parse(
    readFileSync(path.join(projectRoot, "seed", "ktct.json"), "utf8"),
  ) as unknown;
  if (!Array.isArray(raw)) throw new Error("KTCT seed must be an array");

  for (const value of raw) {
    const question = value as Partial<SeedQuestion>;
    const labels = question.options?.map(({ label }) => label).toSorted();
    const identity = `${question.chapter}:${question.sourceNumber}`;
    if (
      !Number.isInteger(question.chapter) ||
      question.chapter! < 1 ||
      question.chapter! > 6 ||
      !Number.isInteger(question.practicePosition) ||
      question.practicePosition! < 1 ||
      !Number.isInteger(question.sourceNumber) ||
      !question.content?.trim() ||
      !question.explanation?.trim() ||
      labels?.join(",") !== "A,B,C,D" ||
      !question.options?.every(({ content }) => content.trim()) ||
      !labels.includes(question.correctLabel ?? "")
    ) {
      throw new Error(`Invalid KTCT seed question: ${identity}`);
    }
  }

  for (let chapter = 1; chapter <= 6; chapter += 1) {
    const chapterPositions = (raw as SeedQuestion[])
      .filter((question) => question.chapter === chapter)
      .map((question) => question.practicePosition)
      .toSorted((left, right) => left - right);
    const expectedPositions = Array.from(
      { length: chapterPositions.length },
      (_, index) => index + 1,
    );
    if (chapterPositions.join(",") !== expectedPositions.join(",")) {
      throw new Error(`Invalid KTCT practice positions for chapter ${chapter}`);
    }
  }

  return raw as SeedQuestion[];
}

export function summarizeSeed(projectRoot: string) {
  const questions = readAndValidateSeed(projectRoot);
  return {
    courses: 1,
    chapters: new Set(questions.map(({ chapter }) => chapter)).size,
    questions: questions.length,
    publishedQuestionOptions: questions.reduce(
      (total, question) => total + question.options.length,
      0,
    ),
  };
}
