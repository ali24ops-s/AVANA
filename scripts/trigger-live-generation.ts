import pg from "pg";
import { randomBytes, createHash } from "node:crypto";

async function runLiveTrigger() {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  const orgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const courseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const docId = "9b24e616-5c1b-4149-8b53-68a5cfa7d434";

  // 1. Get user and create active session directly in DB
  const userRes = await pool.query(
    "SELECT u.id, u.email FROM users u JOIN organization_memberships om ON om.user_id = u.id WHERE om.organization_id = $1 LIMIT 1",
    [orgId],
  );
  const user = userRes.rows[0];
  if (!user) throw new Error("No user found for org");

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = new Date();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [randomBytes(16).toString("hex"), user.id, tokenHash, expiresAt, now],
  );

  console.log(`[AUTH] Active session created for user ${user.email} (${user.id})`);

  const targetUrl = `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`;
  const payload = {
    types: ["lesson", "flashcard", "quiz"],
  };

  console.log(`\n======================================================`);
  console.log(`[STEP 7] HTTP REQUEST DETAILS:`);
  console.log(`Method: POST`);
  console.log(`URL: ${targetUrl}`);
  console.log(`Cookie: avana_session=${rawToken.slice(0, 10)}...`);
  console.log(`Payload:`, JSON.stringify(payload, null, 2));
  console.log(`======================================================\n`);

  const startTime = Date.now();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `avana_session=${rawToken}`,
      "x-request-id": `live-debug-click-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  console.log(`[STEP 7] HTTP RESPONSE:`);
  console.log(`Status Code: ${response.status} ${response.statusText}`);
  const resBodyText = await response.text();
  console.log(`Response Body:`, resBodyText);

  if (!response.ok) {
    throw new Error(`POST /generate returned non-ok status: ${response.status}`);
  }

  const resJson = JSON.parse(resBodyText);
  const jobId = resJson.job_id;
  console.log(`\n[STEP 9 & 10] generation_jobs record created: Job ID = ${jobId}, status = ${resJson.status}`);

  // Poll job status until succeeded
  console.log(`\n[STEP 11 & 12] Polling Job ${jobId} status from Worker & Gemini...`);
  let status = resJson.status;
  let attempts = 0;

  while (attempts < 180 && status !== "succeeded" && status !== "failed") {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const pollRes = await fetch(
      `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate/jobs/${jobId}`,
      {
        headers: {
          Cookie: `avana_session=${rawToken}`,
        },
      },
    );

    if (pollRes.ok) {
      const pollData = (await pollRes.json()) as {
        job: { status: string; error_message?: string };
      };
      status = pollData.job.status;
      console.log(
        `  Attempt #${attempts} (${Math.round((Date.now() - startTime) / 1000)}s): Status = ${status}${pollData.job.error_message ? ` (Error: ${pollData.job.error_message})` : ""}`,
      );
    }
  }

  console.log(`\n======================================================`);
  console.log(`FINAL GENERATION RESULT: ${status.toUpperCase()}`);
  console.log(`======================================================`);

  // Inspect PostgreSQL tables
  console.log(`\n=== [STEP 9] POSTGRESQL: generation_jobs ===`);
  const jobRows = await pool.query(
    "SELECT id, organization_id, document_id, course_id, type, status, attempts, error_code, error_message, created_at, started_at, completed_at FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  console.log(JSON.stringify(jobRows.rows[0], null, 2));

  console.log(`\n=== [STEP 13] POSTGRESQL: generated_contents ===`);
  const contentRows = await pool.query(
    "SELECT id, document_id, course_id, type, status, model, token_usage, payload, created_at FROM generated_contents WHERE document_id = $1 ORDER BY created_at DESC",
    [docId],
  );
  for (const row of contentRows.rows) {
    console.log(`\n--- Artifact [${row.type}] (ID: ${row.id}) ---`);
    console.log(`Status: ${row.status} | Model: ${row.model}`);
    console.log(`Token Usage:`, row.token_usage);
    console.log(
      `Payload Preview:`,
      JSON.stringify(row.payload, null, 2).slice(0, 300) + "...",
    );
  }

  // Review queue API
  console.log(`\n=== [STEP 13] REVIEW QUEUE API ===`);
  const reviewRes = await fetch(
    `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/generated/review-queue`,
    {
      headers: {
        Cookie: `avana_session=${rawToken}`,
      },
    },
  );
  const reviewData = await reviewRes.json();
  console.log(JSON.stringify(reviewData, null, 2));

  await pool.end();
}

runLiveTrigger().catch(console.error);
