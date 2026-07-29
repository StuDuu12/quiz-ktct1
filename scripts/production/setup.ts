import path from "node:path";

import {
  createInitialAdmin,
  createProductionClient,
  seedProduction,
  verifyProductionCounts,
} from "./database";
import { parseSetupEnvironment } from "./lib";

async function main() {
  const environment = parseSetupEnvironment(process.env);
  const client = createProductionClient(environment);
  const adminId = await createInitialAdmin(client, environment);
  console.log("Initial administrator is ready.");

  await seedProduction(
    client,
    path.resolve(import.meta.dirname, "..", ".."),
    adminId,
  );
  console.log("KTCT seed is ready.");

  const counts = await verifyProductionCounts(client);
  console.log(
    `Production counts verified: courses=${counts.courses}, chapters=${counts.chapters}, questions=${counts.questions}, published_question_options=${counts.publishedQuestionOptions}.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production setup failed");
  process.exitCode = 1;
}
