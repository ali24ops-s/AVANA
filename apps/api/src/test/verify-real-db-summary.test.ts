import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@avana/database/schema";
import type { Actor, CourseId, DocumentId, OrganizationId, UserId } from "@avana/domain";
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

    const { db } = client;
    const systemOrgId = randomUUID() as OrganizationId;
    const userOrgId = randomUUID() as OrganizationId;
    const userId = randomUUID() as UserId;
    const systemCourseId = randomUUID() as CourseId;
    const pharm2CourseId = randomUUID() as CourseId;
    const docId = randomUUID() as DocumentId;

    // 1. Insert System & User Organizations
    await db.insert(schema.organizations).values([
      {
        id: systemOrgId,
        name: "System Library Organization",
        slug: `system-org-${systemOrgId.slice(0, 8)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userOrgId,
        name: "Personal User Organization",
        slug: `user-org-${userOrgId.slice(0, 8)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Insert User & Membership
    await db.insert(schema.users).values({
      id: userId,
      email: `summary-user-${userId.slice(0, 8)}@test.com`,
      name: "Summary Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.organizationMemberships).values({
      id: randomUUID(),
      organizationId: userOrgId,
      userId: userId,
      role: "student",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Insert System Course and User Course ("فارماکولوژی ۲")
    await db.insert(schema.courses).values([
      {
        id: systemCourseId,
        organizationId: systemOrgId,
        name: "دوره جامع شیمی دارویی (سیستم)",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: pharm2CourseId,
        organizationId: userOrgId,
        name: "دوره جامع فارماکولوژی ۲",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 4. Insert Document & Module ("فصل: 39") in User Course
    await db.insert(schema.documents).values({
      id: docId,
      organizationId: userOrgId,
      courseId: pharm2CourseId,
      ownerUserId: userId,
      originalName: "فصل_39_فارماکولوژی.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8192,
      sha256: `sha256_${docId.slice(0, 8)}`,
      storageKey: `/storage/${docId}.pdf`,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.modules).values({
      id: randomUUID(),
      courseId: pharm2CourseId,
      documentId: docId,
      title: "فصل: 39 - داروهای ضد باکتری",
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Insert 80 Flashcards for Pharmacology 2 (Chapter 39)
    const userFlashcards = Array.from({ length: 80 }, (_, i) => ({
      id: randomUUID(),
      organizationId: userOrgId,
      courseId: pharm2CourseId,
      documentId: docId,
      question: `سوال فلش‌کارت فصل ۳۹ شماره ${i + 1}`,
      answer: `پاسخ فلش‌کارت فصل ۳۹ شماره ${i + 1}`,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // 6. Insert 20 System Flashcards for System Course
    const systemFlashcards = Array.from({ length: 20 }, (_, i) => ({
      id: randomUUID(),
      organizationId: systemOrgId,
      courseId: systemCourseId,
      question: `سوال فلش‌کارت سیستم شماره ${i + 1}`,
      answer: `پاسخ فلش‌کارت سیستم شماره ${i + 1}`,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await db.insert(schema.flashcards).values([...userFlashcards, ...systemFlashcards]);

    // Find a member of userOrgId from organization_memberships table
    const result = await client.db.execute(
      sql`SELECT user_id FROM organization_memberships WHERE organization_id = ${userOrgId} LIMIT 1;`
    );

    expect(result.rows.length).toBeGreaterThan(0);
    const memberUserId = (result.rows[0] as { user_id: string }).user_id;

    const actor: Actor = {
      userId: memberUserId as UserId,
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
      systemOrgId,
    );

    // Call studyService.getFlashcardSummary directly with userOrgId
    const summary = await studyService.getFlashcardSummary(actor, userOrgId);

    expect(summary.courseMap.size).toBeGreaterThan(0);

    // Fetch courses info to match course IDs to course names
    const courses = await courseStore.listByOrganization(userOrgId, userId, systemOrgId);

    expect(courses.length).toBeGreaterThan(0);

    for (const [cId, stats] of summary.courseMap.entries()) {
      const course = courses.find((c) => c.id === cId);
      expect(course).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
    }

    // Now test the handleGetFlashcardSummary route logic manually to replicate exact HTTP response
    const allFlashcards = await flashcardStore.listByOrganization(userOrgId, systemOrgId);
    expect(allFlashcards.length).toBe(100);

    const pharm2Course = courses.find((c) => c.name.includes("فارماکولوژی ۲"));
    expect(pharm2Course).toBeDefined();

    if (pharm2Course) {
      const pharm2Cards = allFlashcards.filter((f) => f.courseId === pharm2Course.id);
      expect(pharm2Cards.length).toBe(80);

      // Check module 'فصل: 39'
      const modules = await moduleStore.listByCourse(pharm2Course.id);
      const ch39Module = modules.find((m) => m.title.includes("39"));
      expect(ch39Module).toBeDefined();
      if (ch39Module) {
        const ch39Cards = pharm2Cards.filter((f) => f.documentId === ch39Module.documentId);
        expect(ch39Cards.length).toBe(80);
      }
    }
  });
});

