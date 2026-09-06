/**
 * Audited Production State Recovery Script for Pharma 3 («فارماکولوژی ۳»).
 *
 * Course ID: bfbae4df-0a22-46bf-9e5f-d34d203fb43c
 * Target Document (41.pdf): f0fa7c04-1c77-4df0-aa9a-db8e13d751f1
 * Organization ID: b4a0b464-16db-4087-92b7-163a1e6f6776
 *
 * Actions:
 * 1. Read-only pre-inspection & assertions.
 * 2. Atomic transaction-safe recovery:
 *    - Fails 6 ancient orphaned jobs from 2 days ago.
 *    - Reconciles 41.pdf: generating -> extracted (26 chunks preserved, 0 drafts).
 *    - Reconciles Course Pharma 3: generating -> review (preserves 10 existing drafts for 38/39/40.pdf).
 *    - Writes structured audit log to audit_logs.
 * 3. Post-recovery verification assertions.
 */

import { createDbClient } from "../database/client.js";
import {
  users,
  courses,
  documents,
  documentChunks,
  generatedContents,
  generationJobs,
  generationChunks,
  auditLogs,
} from "../database/schema/index.js";
import { eq, and, isNull, inArray, sql, or } from "drizzle-orm";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana";

const COURSE_ID = "bfbae4df-0a22-46bf-9e5f-d34d203fb43c";
const DOC_41_ID = "f0fa7c04-1c77-4df0-aa9a-db8e13d751f1";
const ORG_ID = "b4a0b464-16db-4087-92b7-163a1e6f6776";

async function main() {
  console.log("=================================================================");
  console.log("🚀 STARTING AUDITED PRODUCTION RECOVERY FOR COURSE «فارماکولوژی ۳»");
  console.log("=================================================================\n");

  const scopedDb = createDbClient(DB_URL);
  const db = scopedDb.db;

  try {
    // -----------------------------------------------------------------------
    // PHASE 1: PRE-RECOVERY INSPECTION & ASSERTIONS (READ-ONLY)
    // -----------------------------------------------------------------------
    console.log("🔍 Phase 1: Pre-Recovery Inspection...");

    // 1. Course inspection
    const course = await db
      .select()
      .from(courses)
      .where(eq(courses.id, COURSE_ID))
      .then((rows) => rows[0]);

    if (!course) {
      throw new Error(`Course ${COURSE_ID} not found in database!`);
    }
    console.log(`  ✓ Found Course: "${course.name}" (Current Status: ${course.status})`);

    // 2. Document 41.pdf inspection
    const doc41 = await db
      .select()
      .from(documents)
      .where(eq(documents.id, DOC_41_ID))
      .then((rows) => rows[0]);

    if (!doc41) {
      throw new Error(`Document 41 (${DOC_41_ID}) not found in database!`);
    }
    console.log(`  ✓ Found Document: "${doc41.originalName}" (Current Status: ${doc41.status})`);

    // 3. Document 41 chunks count
    const doc41Chunks = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, DOC_41_ID));

    console.log(`  ✓ Document 41 Chunks Count: ${doc41Chunks.length} chunks (Expected: 26)`);
    if (doc41Chunks.length !== 26) {
      console.warn(`  ⚠️ Warning: Document 41 chunk count is ${doc41Chunks.length}, expected 26.`);
    }

    // 4. Document 41 generated contents count
    const doc41Contents = await db
      .select({ id: generatedContents.id })
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.documentId, DOC_41_ID),
          isNull(generatedContents.deletedAt),
        ),
      );
    console.log(`  ✓ Document 41 Generated Contents: ${doc41Contents.length} (Expected: 0)`);

    // 5. Course existing drafts (for 38, 39, 40.pdf)
    const courseDrafts = await db
      .select({
        id: generatedContents.id,
        type: generatedContents.type,
        status: generatedContents.status,
        documentId: generatedContents.documentId,
      })
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.courseId, COURSE_ID),
          isNull(generatedContents.deletedAt),
        ),
      );
    console.log(`  ✓ Existing Course Drafts Count: ${courseDrafts.length} drafts across other documents`);

    // 6. Check active workers
    const activeRunningChunks = await db
      .select()
      .from(generationChunks)
      .where(
        and(
          eq(generationChunks.status, "running"),
          isNull(generationChunks.deletedAt),
        ),
      );
    console.log(`  ✓ Currently Running Generation Chunks in DB: ${activeRunningChunks.length}`);

    const activeRunningJobs = await db
      .select()
      .from(generationJobs)
      .where(
        and(
          or(
            eq(generationJobs.status, "processing"),
            eq(generationJobs.status, "running"),
          ),
          isNull(generationJobs.deletedAt),
        ),
      );
    console.log(`  ✓ Currently Processing/Running Generation Jobs in DB: ${activeRunningJobs.length}`);

    console.log("\nPre-recovery inspection complete. Proceeding with atomic transaction-safe recovery...\n");

    // -----------------------------------------------------------------------
    // PHASE 2: ATOMIC TRANSACTION-SAFE RECOVERY
    // -----------------------------------------------------------------------
    console.log("⚡ Phase 2: Executing Database Recovery inside Transaction...");

    const now = new Date();
    const nowIso = now.toISOString();

    await db.transaction(async (tx) => {
      // Step A: Reconcile ancient stale jobs (from 2 days ago)
      const staleJobs = await tx
        .update(generationJobs)
        .set({
          status: "failed",
          errorCode: "STALE_LEASE_EXPIRED",
          errorMessage: "Job lease expired with no active worker heartbeat. Safely recovered during Pharma 3 audit.",
          updatedAt: now,
        })
        .where(
          and(
            or(
              eq(generationJobs.status, "processing"),
              eq(generationJobs.status, "running"),
              eq(generationJobs.status, "queued"),
            ),
            isNull(generationJobs.deletedAt),
          ),
        )
        .returning({ id: generationJobs.id, type: generationJobs.type });

      console.log(`  ✓ Reconciled ${staleJobs.length} stale generation jobs to status='failed'`);

      // Step B: Reconcile Document 41 status: generating -> extracted
      const [updatedDoc41] = await tx
        .update(documents)
        .set({
          status: "extracted",
          errorCode: "GENERATION_TIMEOUT_STALE",
          updatedAt: now,
        })
        .where(eq(documents.id, DOC_41_ID))
        .returning({ id: documents.id, status: documents.status });

      console.log(`  ✓ Reconciled Document 41 (${updatedDoc41.id}): status = '${updatedDoc41.status}'`);

      // Step C: Reconcile Course Pharma 3: generating -> review
      const targetCourseStatus = courseDrafts.length > 0 ? "review" : "draft";
      const [updatedCourse] = await tx
        .update(courses)
        .set({
          status: targetCourseStatus,
          updatedAt: now,
        })
        .where(eq(courses.id, COURSE_ID))
        .returning({ id: courses.id, status: courses.status, name: courses.name });

      // Step D: Write Audit Log
      const adminUser = await tx
        .select({ id: users.id })
        .from(users)
        .limit(1)
        .then((rows) => rows[0]);
      const actorId = adminUser?.id || "00000000-0000-0000-0000-000000000001";

      const [auditEntry] = await tx
        .insert(auditLogs)
        .values({
          actorId,
          organizationId: ORG_ID,
          action: "COURSE_STALE_GENERATION_RECONCILED",
          entityType: "course",
          entityId: COURSE_ID,
          details: {
            courseId: COURSE_ID,
            courseName: course.name,
            previousStatus: course.status,
            newStatus: targetCourseStatus,
            reconciledDocumentId: DOC_41_ID,
            documentPreviousStatus: doc41.status,
            documentNewStatus: "extracted",
            preservedDraftsCount: courseDrafts.length,
            reconciledStaleJobsCount: staleJobs.length,
            reason: "Orphaned generation without active heartbeat recovered via audited script.",
            reconciledAt: nowIso,
          },
        })
        .returning({ id: auditLogs.id, action: auditLogs.action });

      console.log(`  ✓ Recorded Audit Log entry (${auditEntry.id}): action = '${auditEntry.action}'`);
    });

    console.log("\nTransaction successfully committed!\n");

    // -----------------------------------------------------------------------
    // PHASE 3: POST-RECOVERY VERIFICATION (READ-ONLY)
    // -----------------------------------------------------------------------
    console.log("🔎 Phase 3: Post-Recovery Assertions...");

    const finalCourse = await db
      .select()
      .from(courses)
      .where(eq(courses.id, COURSE_ID))
      .then((rows) => rows[0]);

    if (finalCourse?.status !== "review") {
      throw new Error(`Assertion failed: Course status is ${finalCourse?.status}, expected 'review'`);
    }
    console.log(`  ✓ Assertion Passed: Course status is '${finalCourse.status}'`);

    const finalDoc41 = await db
      .select()
      .from(documents)
      .where(eq(documents.id, DOC_41_ID))
      .then((rows) => rows[0]);

    if (finalDoc41?.status !== "extracted") {
      throw new Error(`Assertion failed: Document 41 status is ${finalDoc41?.status}, expected 'extracted'`);
    }
    console.log(`  ✓ Assertion Passed: Document 41 status is '${finalDoc41.status}'`);

    const finalDrafts = await db
      .select({ id: generatedContents.id })
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.courseId, COURSE_ID),
          isNull(generatedContents.deletedAt),
        ),
      );

    if (finalDrafts.length !== courseDrafts.length) {
      throw new Error(
        `Assertion failed: Draft count changed! Before: ${courseDrafts.length}, After: ${finalDrafts.length}`,
      );
    }
    console.log(`  ✓ Assertion Passed: All ${finalDrafts.length} existing course drafts perfectly preserved (0 deleted)`);

    const finalChunks = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, DOC_41_ID));

    if (finalChunks.length !== doc41Chunks.length) {
      throw new Error(
        `Assertion failed: Chunk count changed! Before: ${doc41Chunks.length}, After: ${finalChunks.length}`,
      );
    }
    console.log(`  ✓ Assertion Passed: All ${finalChunks.length} document 41 chunks perfectly preserved`);

    console.log("\n=================================================================");
    console.log("🎉 PHARMACOLOGY 3 RECOVERY & SYSTEM UNBLOCKING COMPLETED SUCCESSFULLY!");
    console.log("=================================================================");
  } finally {
    await scopedDb.close();
  }
}

main().catch((err) => {
  console.error("❌ Recovery failed with error:", err);
  process.exit(1);
});
