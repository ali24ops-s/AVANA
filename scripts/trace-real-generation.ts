import pg from "pg";
import { randomBytes } from "crypto";

async function traceRealGeneration() {
  const docId = "ff535510-c8ce-4550-b72b-7e0b8192e0b4";
  const orgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const courseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";

  const pool = new pg.Pool({
    connectionString: "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  // Ensure an authenticated session exists for the user
  const userRes = await pool.query("SELECT id, email FROM users LIMIT 1");
  const user = userRes.rows[0];
  const rawToken = randomBytes(32).toString("base64url");
  const hashedToken = (await import("crypto")).createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [(await import("crypto")).randomUUID(), user.id, hashedToken, expiresAt],
  );

  const requestUrl = `http://127.0.0.1:3000/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`;
  const requestBody = { types: ["lesson", "flashcard", "quiz"] };

  console.log("=== 1. REQUEST TRACE ===");
  console.log("Method: POST");
  console.log("URL:", requestUrl);
  console.log("Headers: Cookie: avana_session=..., Content-Type: application/json");
  console.log("Body:", JSON.stringify(requestBody, null, 2));

  const startTime = Date.now();
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `avana_session=${rawToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  const resStatus = response.status;
  const resBodyText = await response.text();

  console.log("\n=== 2. RESPONSE TRACE ===");
  console.log("HTTP Status:", resStatus);
  console.log("Response Body:", resBodyText);

  if (!response.ok) {
    console.error("Non-OK response received!");
    await pool.end();
    return;
  }

  const resJson = JSON.parse(resBodyText);
  const jobId = resJson.job_id;

  console.log("\n=== 3. JOB CREATION ===");
  console.log("Job ID:", jobId);

  console.log("\n=== 4. POLLING JOB STATUS ===");
  let status = resJson.status;
  let attempts = 0;
  let lastErrorMessage = "";

  while (attempts < 60 && status !== "succeeded" && status !== "failed") {
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
      lastErrorMessage = pollData.job.error_message || "";
      console.log(`[Attempt ${attempts} | ${Math.round((Date.now() - startTime) / 1000)}s] Status: ${status}`);
    }
  }

  console.log("\n=== 5. DATABASE STATE ===");
  console.log("--- generation_jobs row ---");
  const jobRow = await pool.query(
    "SELECT id, organization_id, document_id, course_id, type, status, attempts, error_code, error_message, created_at, started_at, completed_at FROM generation_jobs WHERE id = $1",
    [jobId],
  );
  console.log(JSON.stringify(jobRow.rows[0], null, 2));

  console.log("\n--- generated_contents rows for document ---");
  const contentRows = await pool.query(
    "SELECT id, document_id, course_id, type, status, model, token_usage, created_at FROM generated_contents WHERE document_id = $1 ORDER BY created_at DESC",
    [docId],
  );
  console.log(JSON.stringify(contentRows.rows, null, 2));

  console.log("\n--- generated_content_citations count ---");
  const citationRows = await pool.query(
    "SELECT COUNT(*) AS total_citations FROM generated_content_citations gcc JOIN generated_contents gc ON gc.id = gcc.generated_content_id WHERE gc.document_id = $1",
    [docId],
  );
  console.log(JSON.stringify(citationRows.rows[0], null, 2));

  console.log("\n=== 6. REVIEW QUEUE API ===");
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

traceRealGeneration().catch(console.error);
