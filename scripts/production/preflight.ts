import { readFileSync } from "node:fs";
import path from "node:path";

import {
  EXPECTED_PRODUCTION_COUNTS,
  discoverMigrationFiles,
  parseProductionEnvironment,
  summarizeSeed,
} from "./lib";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

function main() {
  parseProductionEnvironment(process.env);
  const migrations = discoverMigrationFiles(projectRoot);
  const seedCounts = summarizeSeed(projectRoot);
  if (JSON.stringify(seedCounts) !== JSON.stringify(EXPECTED_PRODUCTION_COUNTS)) {
    throw new Error("KTCT seed counts do not match production requirements");
  }

  const image = readFileSync(path.join(projectRoot, "public", "og.png"));
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== 1200 || height !== 630) {
    throw new Error("public/og.png must be exactly 1200x630");
  }

  console.log(`Preflight verified ${migrations.length} ordered migrations.`);
  console.log(
    `Seed verified: courses=${seedCounts.courses}, chapters=${seedCounts.chapters}, questions=${seedCounts.questions}, published_question_options=${seedCounts.publishedQuestionOptions}.`,
  );
  console.log("Social preview verified at 1200x630.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production preflight failed");
  process.exitCode = 1;
}
