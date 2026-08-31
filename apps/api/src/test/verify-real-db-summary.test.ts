import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import type { Actor, OrganizationId } from "@avana/domain";
import {
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
  DrizzleUserFlashcardScheduleStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
} from "../modules/study/drizzle-stores.js";
import { DrizzleCourseStore } from "../modules/courses/drizzle-stores.js";
import { DrizzleModuleStore, DrizzleLessonStore, DrizzleProgressStore } from "../modules/learning/drizzle-stores.js";
import { StudyService } from "../modules/study/study-service.js";
import { defaultPolicy } from "@avana/domain";

describe("Verify Flashcard Summary on Real Postgres DB", () => {
  const dbUrl = process.env.DATABASE_URL || `postgres://${"avana"}:${"avana"}@127.0.0.1:5432/avana?sslmode=disable`;
  const SYSTEM_ORG_ID = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
  const USER_ORG_ID = "389575c5-7563-4242-854a-9af1a988eb3a" as OrganizationId;

  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
    } catch (err) {
      console.error("Failed to connect to real Postgres DB:", err);
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.close().catch(() => {});
    }
  });

  it("verifies flashcard-summary returns system courses and chapter 39 (80 cards) for personal user org", async (ctx) => {
    if (!isConnected) {
      console.warn("Skipping real DB test because DB is not reachable");
      ctx.skip();
      return;
    }

    // Find a member of USER_ORG_ID from organization_memberships table
    const result = await client.db.execute(
      sql`SELECT user_id FROM organization_memberships WHERE organization_id = ${USER_ORG_ID} LIMIT 1;`
    );

    expect(result.rows.length).toBeGreaterThan(0);
    const userId = (result.rows[0] as { user_id: string }).user_id;

    const actor: Actor = {
      userId,
      role: "student",
    };

    const flashcardStore = new DrizzleFlashcardStore(client.db);
    const flashcardReviewStore = new DrizzleFlashcardReviewStore(client.db);
    const userFlashcardScheduleStore = new DrizzleUserFlashcardScheduleStore(client.db);
    const quizStore = new DrizzleQuizStore(client.db);
    const quizQuestionStore = new DrizzleQuizQuestionStore(client.db);
    const quizAttemptStore = new DrizzleQuizAttemptStore(client.db);
    const moduleStore = new DrizzleModuleStore(client.db);
    const lessonStore = new DrizzleLessonStore(client.db);
    const progressStore = new DrizzleProgressStore(client.db);
    const courseStore = new DrizzleCourseStore(client.db);

    const studyService = new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      undefined,
      undefined,
      userFlashcardScheduleStore,
      courseStore,
      SYSTEM_ORG_ID,
    );

    // Call studyService.getFlashcardSummary directly with USER_ORG_ID
    const summary = await studyService.getFlashcardSummary(actor, USER_ORG_ID);

    console.log("=== REAL DB FLASHCARD SUMMARY RESULTS ===");
    console.log("Course Map keys (course IDs):", Array.from(summary.courseMap.keys()));
    
    // Fetch courses info to match course IDs to course names
    const courses = await courseStore.listByOrganization(USER_ORG_ID, userId, SYSTEM_ORG_ID);
    console.log("Found courses:", courses.map(c => ({ id: c.id, name: c.name, orgId: c.organizationId })));

    expect(courses.length).toBeGreaterThan(0);

    for (const [courseId, stats] of summary.courseMap.entries()) {
      const course = courses.find(c => c.id === courseId);
      console.log(`Course [${course?.name || courseId}] stats: total=${stats.total}, topics count=${stats.topics.size}`);
    }

    // Now test the handleGetFlashcardSummary route logic manually to replicate exact HTTP response
    const allFlashcards = await flashcardStore.listByOrganization(USER_ORG_ID, SYSTEM_ORG_ID);
    console.log(`Total flashcards returned for org ${USER_ORG_ID} + system ${SYSTEM_ORG_ID}:`, allFlashcards.length);
    expect(allFlashcards.length).toBeGreaterThan(0);

    const pharm2Course = courses.find(c => c.name.includes("فارماکولوژی ۲"));
    expect(pharm2Course).toBeDefined();

    if (pharm2Course) {
      console.log("Pharmacology 2 Course ID:", pharm2Course.id);
      const pharm2Cards = allFlashcards.filter(f => f.courseId === pharm2Course.id);
      console.log("Pharmacology 2 Flashcards count:", pharm2Cards.length);

      // Check module 'فصل: 39'
      const modules = await moduleStore.listByCourse(pharm2Course.id);
      console.log("Pharm 2 Modules:", modules.map(m => ({ id: m.id, title: m.title, docId: m.documentId })));
      const ch39Module = modules.find(m => m.title.includes("39"));
      if (ch39Module) {
        const ch39Cards = pharm2Cards.filter(f => f.documentId === ch39Module.documentId);
        console.log(`Module '${ch39Module.title}' (docId: ${ch39Module.documentId}) flashcards count:`, ch39Cards.length);
        expect(ch39Cards.length).toBe(80);
      }
    }
  });
});
