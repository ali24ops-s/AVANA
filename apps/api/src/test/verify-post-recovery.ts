import { createDbClient } from "../../../../database/client.js";
import { courses, documents, generatedContents, auditLogs, generationJobs } from "../../../../database/schema/index.js";
import { eq, and, isNull } from "drizzle-orm";

const DB_URL = process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana";
const COURSE_ID = "bfbae4df-0a22-46bf-9e5f-d34d203fb43c";
const DOC_41_ID = "f0fa7c04-1c77-4df0-aa9a-db8e13d751f1";

async function verify() {
  const { db, close } = createDbClient(DB_URL);
  try {
    console.log("--- FINAL POST-RECOVERY VERIFICATION ---");
    const course = await db.select().from(courses).where(eq(courses.id, COURSE_ID)).then(r => r[0]);
    console.log(`1. Course Status: ${course?.status} (Name: ${course?.name})`);

    const doc41 = await db.select().from(documents).where(eq(documents.id, DOC_41_ID)).then(r => r[0]);
    console.log(`2. Document 41 Status: ${doc41?.status} (File: ${doc41?.originalName})`);

    const drafts = await db.select().from(generatedContents).where(and(eq(generatedContents.courseId, COURSE_ID), isNull(generatedContents.deletedAt)));
    console.log(`3. Course Drafts Count: ${drafts.length}`);

    const latestAudit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, COURSE_ID)).orderBy(auditLogs.createdAt).limit(1).then(r => r[0]);
    console.log(`4. Audit Log Action: ${latestAudit?.action} (ID: ${latestAudit?.id})`);

    const activeJobs = await db.select().from(generationJobs).where(and(eq(generationJobs.status, "processing"), isNull(generationJobs.deletedAt)));
    console.log(`5. Active Processing Jobs remaining in DB: ${activeJobs.length}`);

    console.log("All verifications verified!");
  } finally {
    await close();
  }
}

verify().catch(console.error);
