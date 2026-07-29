import { createProductionClient, verifyProductionCounts } from "./database";
import { parseProductionEnvironment } from "./lib";

try {
  const environment = parseProductionEnvironment(process.env);
  const counts = await verifyProductionCounts(
    createProductionClient(environment),
  );
  console.log(
    `Production counts verified: courses=${counts.courses}, chapters=${counts.chapters}, questions=${counts.questions}, published_question_options=${counts.publishedQuestionOptions}, active_mock_exam_configs=${counts.activeMockExamConfigs}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production verification failed");
  process.exitCode = 1;
}
