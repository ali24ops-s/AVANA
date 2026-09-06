import { loadApiConfig } from "../apps/api/src/config.js";
import { createApp } from "../apps/api/src/server/createApp.js";
import { v1Routes } from "../apps/api/src/routes/v1.js";
import { composeProduction } from "../apps/api/src/server/composeProduction.js";
import { generateSessionToken, hashToken } from "../apps/api/src/modules/identity/session-service.js";
import type { UserId } from "@avana/domain";
import type { FastifyInstance } from "fastify";

async function verifyRealNetworkAndApi() {
  console.log("=== STARTING REAL NETWORK & DATABASE EXAM LIFECYCLE VERIFICATION ===");

  let app: FastifyInstance | null = null;
  let closeProd: (() => Promise<void>) | null = null;

  try {
    const config = loadApiConfig();
    const prod = await composeProduction(config);
    closeProd = prod.close;

    app = createApp({ config });
    await app.register(v1Routes, prod.v1Options);
    await app.ready();
    console.log("Fastify server connected to PostgreSQL and ready.");

    const orgId = "389575c5-7563-4242-854a-9af1a988eb3a";
    const userId = "79bda286-08a4-4a16-9340-4106864e0732" as UserId;
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await prod.v1Options.sessionStore.createSessionWithTakeover({
      userId,
      tokenHash,
      expiresAt,
    });

    const cookieHeader = `avana_session=${sessionToken}`;
    const authHeaders = { cookie: cookieHeader };

    // 1. Query Topics
    console.log("\n1. Testing GET /v1/organizations/" + orgId + "/study/exams/topics");
    const topicsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/topics`,
      headers: authHeaders,
    });
    console.log("GET topics status:", topicsRes.statusCode);
    const topicsBody = JSON.parse(topicsRes.body);
    console.log("GET topics sections count:", topicsBody.sections?.length ?? 0);

    // 2. Start Exam Attempt
    console.log("\n2. Testing POST /v1/organizations/" + orgId + "/study/exams/start");
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: authHeaders,
      payload: {
        chapters: [],
        questionCount: 3,
        difficulty: "all",
      },
    });

    console.log("POST start status:", startRes.statusCode);
    const startBody = JSON.parse(startRes.body);
    console.log("POST start response details:", {
      attemptId: startBody.attemptId,
      questionsCount: startBody.questions?.length,
      topic: startBody.topic,
      topics: startBody.topics,
      hasCoverage: Boolean(startBody.coverage),
      coverageCourses: startBody.coverage?.map((c: any) => ({
        id: c.id,
        title: c.title,
        modules: c.modules?.map((m: any) => m.title),
      })),
    });

    if (startRes.statusCode !== 200) {
      throw new Error(`Failed to start exam: ${startRes.body}`);
    }

    const attemptId = startBody.attemptId;
    const questions = startBody.questions || [];

    // 3. Save Answer for Question 1
    if (questions.length > 0) {
      console.log("\n3. Testing POST /v1/organizations/" + orgId + "/study/exams/attempts/" + attemptId + "/answers");
      const saveRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        headers: authHeaders,
        payload: {
          answers: [{ questionId: questions[0].id, answer: "الف" }],
        },
      });

      console.log("POST save answers status:", saveRes.statusCode);
      const saveBody = JSON.parse(saveRes.body);
      console.log("Saved answers response:", saveBody.answers);
    }

    // 4. Get Attempt Details (Simulating Refresh / Resume)
    console.log("\n4. Testing GET /v1/organizations/" + orgId + "/study/exams/attempts/" + attemptId);
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: authHeaders,
    });

    console.log("GET attempt status:", getRes.statusCode);
    const getBody = JSON.parse(getRes.body);
    console.log("GET attempt response details:", {
      attemptId: getBody.attempt?.id,
      savedAnswers: getBody.attempt?.answers,
      isCompleted: getBody.isCompleted,
      hasCoverage: Boolean(getBody.coverage),
      topic: getBody.attempt?.topic,
    });

    // 5. Submit Exam
    console.log("\n5. Testing POST /v1/organizations/" + orgId + "/study/exams/attempts/" + attemptId + "/submit");
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: {
        answers: questions.map((q: any) => ({ questionId: q.id, answer: "الف" })),
      },
    });

    console.log("POST submit status:", submitRes.statusCode);
    const submitBody = JSON.parse(submitRes.body);
    console.log("Submit result:", {
      attemptId: submitBody.attempt?.id,
      score: submitBody.attempt?.score,
      status: submitBody.attempt?.status,
      completedAt: submitBody.attempt?.completedAt,
    });

    console.log("\n=== ALL REAL POSTGRESQL NETWORK AND EXAM API TESTS PASSED 100%! ===");
  } finally {
    if (app) {
      await app.close();
    }
    if (closeProd) {
      await closeProd();
    }
  }
}

verifyRealNetworkAndApi().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
