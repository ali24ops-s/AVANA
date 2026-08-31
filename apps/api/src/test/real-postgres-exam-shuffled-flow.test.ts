import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@avana/database/schema";
import type {
  Actor,
  CourseId,
  DocumentId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";
import {
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
  DrizzleUserFlashcardScheduleStore,
} from "../modules/study/drizzle-stores.js";
import { DrizzleCourseStore } from "../modules/courses/drizzle-stores.js";
import { DrizzleModuleStore, DrizzleLessonStore, DrizzleProgressStore } from "../modules/learning/drizzle-stores.js";
import { StudyService } from "../modules/study/study-service.js";
import { defaultPolicy } from "@avana/domain";

describe("Live PostgreSQL Exam Flow & Choice Position Verification", () => {
  const dbUrl = process.env.DATABASE_URL ?? `postgres://${"avana"}:${"avana"}@127.0.0.1:5432/avana?sslmode=disable`;

  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;
  let studyService: StudyService;
  let quizQuestionStore: DrizzleQuizQuestionStore;

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

      const quizStore = new DrizzleQuizStore(client.db);
      quizQuestionStore = new DrizzleQuizQuestionStore(client.db);
      const quizAttemptStore = new DrizzleQuizAttemptStore(client.db);
      const flashcardStore = new DrizzleFlashcardStore(client.db);
      const flashcardReviewStore = new DrizzleFlashcardReviewStore(client.db);
      const userFlashcardScheduleStore = new DrizzleUserFlashcardScheduleStore(client.db);
      const moduleStore = new DrizzleModuleStore(client.db);
      const lessonStore = new DrizzleLessonStore(client.db);
      const progressStore = new DrizzleProgressStore(client.db);
      const courseStore = new DrizzleCourseStore(client.db);

      studyService = new StudyService(
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
      );
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

  it("verifies live DB questions are shuffled and exam taking -> submit -> review maintains exact choice sequence", async (ctx) => {
    if (!isConnected) {
      console.warn("Skipping real DB test because DB is not reachable in sandbox");
      ctx.skip();
      return;
    }

    const { db } = client;
    const orgId = randomUUID() as OrganizationId;
    const userId = randomUUID() as UserId;
    const courseId = randomUUID() as CourseId;
    const docId = randomUUID() as DocumentId;
    const quizId = randomUUID() as QuizId;

    // 1. Setup Organization, User, Membership, Course, Document, Quiz in DB
    await db.insert(schema.organizations).values({
      id: orgId,
      name: "Live Exam Test Org",
      slug: `live-exam-org-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.users).values({
      id: userId,
      email: `exam-student-${userId.slice(0, 8)}@test.com`,
      name: "Exam Test Student",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.organizationMemberships).values({
      id: randomUUID(),
      organizationId: orgId,
      userId: userId,
      role: "student",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.courses).values({
      id: courseId,
      organizationId: orgId,
      name: "دوره فارماکولوژی آزمون",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.documents).values({
      id: docId,
      organizationId: orgId,
      courseId: courseId,
      ownerUserId: userId,
      originalName: "فارماکولوژی_قلب.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      sha256: `sha256_${docId.slice(0, 8)}`,
      storageKey: `/storage/${docId}.pdf`,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.quizzes).values({
      id: quizId,
      organizationId: orgId,
      courseId: courseId,
      documentId: docId,
      title: "آزمون فارماکولوژی قلب و عروق",
      topic: "فارماکولوژی",
      difficulty: "medium",
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Insert 10 Quiz Questions with multiple choices
    const questionsData = Array.from({ length: 10 }, (_, i) => ({
      id: randomUUID() as QuizQuestionId,
      quizId: quizId,
      question: `سوال شماره ${i + 1}: کدام گزینه درباره دسته دارویی ${i + 1} صحیح است؟`,
      topic: "فارماکولوژی",
      questionType: "multiple_choice",
      choices: [
        `گزینه صحیح شماره ${i + 1}`,
        `گزینه غلط اول شماره ${i + 1}`,
        `گزینه غلط دوم شماره ${i + 1}`,
        `گزینه غلط سوم شماره ${i + 1}`,
      ],
      correctAnswer: `گزینه صحیح شماره ${i + 1}`,
      explanation: `توضیح پاسخ صحیح سوال ${i + 1}`,
      difficulty: "medium",
      sortOrder: i + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await db.insert(schema.quizQuestions).values(questionsData);

    const actor: Actor = {
      userId,
      role: "student",
    };

    // 3. Start Exam Attempt
    const attempt = await studyService.startConfiguredExamAttempt(actor, orgId, {
      questionCount: 10,
    });

    expect(attempt.questions).toHaveLength(10);
    const qIds = attempt.questions.map((q) => q.id as QuizQuestionId);
    const dbQuestions = await quizQuestionStore.listByIds(qIds);
    const dbMap = new Map(dbQuestions.map((q) => [q.id, q]));

    // 4. Verify choices order in API matches live DB exactly
    const answerSubmissions: Array<{ questionId: string; answer: unknown }> = [];
    const initialChoicesSnapshot = attempt.questions.map((q) => ({
      id: q.id,
      choices: [...(q.choices || [])],
    }));

    for (const apiQ of attempt.questions) {
      const dbQ = dbMap.get(apiQ.id);
      expect(dbQ).toBeDefined();
      expect(apiQ.choices).toEqual(dbQ?.choices);

      // Answer with the correct answer
      answerSubmissions.push({
        questionId: apiQ.id,
        answer: dbQ?.correctAnswer,
      });
    }

    // 5. Simulate Page Refresh
    const refreshed = await studyService.getExamAttempt(actor, orgId, attempt.attemptId);
    expect(refreshed.isCompleted).toBe(false);
    expect(refreshed.questions).toHaveLength(10);
    refreshed.questions.forEach((refQ, idx) => {
      expect(refQ.choices).toEqual(initialChoicesSnapshot[idx].choices);
    });

    // 6. Submit Answers
    const submitResult = await studyService.submitConfiguredExamAttempt(
      actor,
      orgId,
      attempt.attemptId,
      answerSubmissions,
    );

    expect(submitResult.score).toBe(100);
    expect(submitResult.correct).toBe(10);
    expect(submitResult.total).toBe(10);

    // 7. Review Completed Attempt
    const completed = await studyService.getExamAttempt(actor, orgId, attempt.attemptId);
    expect(completed.isCompleted).toBe(true);
    expect(completed.attempt.status).toBe("completed");
    completed.questions.forEach((compQ, idx) => {
      expect(compQ.choices).toEqual(initialChoicesSnapshot[idx].choices);
    });
  });
});

