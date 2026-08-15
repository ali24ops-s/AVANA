import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@avana/database/schema";
import { SessionService } from "@avana/api/src/modules/identity/session-service.js";
import { DrizzleSessionStore } from "@avana/api/src/modules/identity/drizzle-stores.js";
import { loadApiConfig } from "@avana/api/src/config.js";

async function runLiveTrigger() {
  const config = loadApiConfig();
  const pool = new pg.Pool({ connectionString: config.database.url });
  const db = drizzle(pool, { schema });

  const orgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const courseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const docId = "9b24e616-5c1b-4149-8b53-68a5cfa7d434";

  // 1. Get user and create active session
  const sessionStore = new DrizzleSessionStore(db);
  const sessionService = new SessionService(sessionStore, config.session);
  const [user] = await pool.query(
    "SELECT u.id FROM users u JOIN organization_memberships om ON om.user_id = u.id WHERE om.organization_id = $1 LIMIT 1",
    [orgId],
  ).then((r) => r.rows);

  if (!user) throw new Error("No user found for org");

  const { sessionToken } = await sessionService.createSession(user.id);
  console.log(`[AUTH] Active session token generated for user ${user.id}`);

  const targetUrl = `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`;
  const payload = {
    types: ["lesson", "flashcard", "quiz"],
  };

  console.log(`\n[STEP 7] HTTP REQUEST:`);
  console.log(`Method: POST`);
  console.log(`URL: ${targetUrl}`);
  console.log(`Payload:`, JSON.stringify(payload));
  console.log(`Cookie: avana_session=${sessionToken}`);

  const startTime = Date.now();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `avana_session=${sessionToken}`,
      "x-request-id": "live-debug-click-1",
    },
    body: JSON.stringify(payload),
  });

  console.log(`\n[STEP 7] HTTP RESPONSE:`);
  console.log(`Status Code: ${response.status} ${response.statusText}`);
  const resBodyText = await response.text();
  console.log(`Response Body:`, resBodyText);

  if (!response.ok) {
    throw new Error(`POST /generate returned non-ok status: ${response.status}`);
  }

  const resJson = JSON.parse(resBodyText);
  const jobId = resJson.job_id;
  console.log(`\n[STEP 9 & 10] JOB QUEUED: Job ID = ${jobId}`);

  // Poll job status until succeeded
  console.log(`\n[STEP 11 & 12] Polling Job ${jobId} status from Worker & Gemini...`);
  let status = resJson.status;
  let attempts = 0;

  while (attempts < 60 && status !== "succeeded" && status !== "failed") {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const pollRes = await fetch(
      `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate/jobs/${jobId}`,
      {
        headers: {
          Cookie: `avana_session=${sessionToken}`,
        },
      },
    );

    if (pollRes.ok) {
      const pollData = await pollRes.json();
      status = pollData.job.status;
      console.log(
        `  Poll attempt #${attempts} (${Date.now() - startTime}ms): status = ${status}${pollData.job.error_message ? ` (Error: ${pollData.job.error_message})` : ""}`,
      );
    }
  }

  console.log(`\nFinal Job Status: ${status}`);

  // Inspect PostgreSQL tables
  console.log(`\n=== [STEP 9] POSTGRESQL: generation_jobs ===`);
  const jobRows = await pool.query(
    "SELECT * FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  console.log(JSON.stringify(jobRows.rows[0], null, 2));

  console.log(`\n=== [STEP 13] POSTGRESQL: generated_contents ===`);
  const contentRows = await pool.query(
    "SELECT id, document_id, course_id, type, status, model, token_usage, created_at FROM generated_contents WHERE document_id = $1 ORDER BY created_at DESC",
    [docId],
  );
  console.log(JSON.stringify(contentRows.rows, null, 2));

  // Review queue API
  console.log(`\n=== [STEP 13] REVIEW QUEUE API ===`);
  const reviewRes = await fetch(
    `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/generated/review-queue`,
    {
      headers: {
        Cookie: `avana_session=${sessionToken}`,
      },
    },
  );
  const reviewData = await reviewRes.json();
  console.log(JSON.stringify(reviewData, null, 2));

  await pool.end();
}

runLiveTrigger().catch(console.error);
