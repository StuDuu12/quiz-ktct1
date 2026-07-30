import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as expireAttempt } from "@/app/api/e2e/attempts/[attemptId]/expire/route";
import { POST as login } from "@/app/api/e2e/auth/login/route";
import { POST as register } from "@/app/api/e2e/auth/register/route";
import { GET as confirmEmail } from "@/app/api/e2e/confirm/route";
import { POST as saveInstructorQuestion } from "@/app/api/e2e/instructor/questions/route";
import { POST as reset } from "@/app/api/e2e/reset/route";
import * as fixtureStore from "@/src/e2e/store";

const fixtureActionNames = [
  "authenticateE2EUser",
  "confirmE2EEmail",
  "deleteE2EQuestion",
  "expireE2EExam",
  "finishE2EPractice",
  "getE2EAdminAudits",
  "getE2EAdminCatalog",
  "getE2EAdminQuestions",
  "getE2EAdminReport",
  "getE2EAdminUsers",
  "getE2EAttemptHistory",
  "getE2ECourseDashboard",
  "getE2EExamReview",
  "getE2EHistoryChapters",
  "getE2EMockExamLaunch",
  "getE2EPracticeChapter",
  "getE2EViewer",
  "loadE2EExam",
  "loadE2EPractice",
  "loadOrStartE2EPractice",
  "registerE2EStudent",
  "resetE2EStore",
  "saveE2EExamAnswer",
  "saveE2EExamFlag",
  "saveE2EQuestion",
  "saveE2EPracticeAnswer",
  "saveE2EPracticeFlag",
  "startE2EExam",
  "startE2EPractice",
  "setE2EUserActive",
  "setE2EUserRole",
  "submitE2EExam",
] as const;

function emulateProductionWithFixtureFlagsSet() {
  vi.stubEnv("E2E_MODE", "1");
  vi.stubEnv("E2E_TEST_SERVER", "1");
  vi.stubEnv("NODE_ENV", "production");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("E2E fixture production boundary", () => {
  it("fails every exported fixture action closed in production", () => {
    emulateProductionWithFixtureFlagsSet();

    const exportedActions = Object.entries(fixtureStore)
      .filter((entry): entry is [string, (...args: unknown[]) => unknown] =>
        typeof entry[1] === "function",
      )
      .sort(([left], [right]) => left.localeCompare(right));

    expect(exportedActions.map(([name]) => name)).toEqual(
      [...fixtureActionNames].sort(),
    );
    for (const [name, action] of exportedActions) {
      expect(
        () => action(),
        `${name} must reject fixture access in production`,
      ).toThrow("E2E_FIXTURE_DISABLED");
    }
  });

  it("returns 404 from every fixture HTTP endpoint in production", async () => {
    emulateProductionWithFixtureFlagsSet();
    const request = new NextRequest("http://localhost/api/e2e/test", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });

    const responses = await Promise.all([
      reset(),
      register(request),
      login(request),
      confirmEmail(
        new NextRequest(
          "http://localhost/api/e2e/confirm?email=x@example.test",
        ),
      ),
      expireAttempt(request, {
        params: Promise.resolve({ attemptId: "e2e-exam-1" }),
      }),
      saveInstructorQuestion(request),
    ]);

    expect(responses).toHaveLength(6);
    for (const response of responses) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found" });
    }
  });
});
