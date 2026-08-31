import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "@avana/database/schema";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
} from "@avana/domain";
import { ReviewService } from "../modules/generation/review-service.js";
import type { GenerationQueueService } from "../modules/generation/generation-queue.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
} from "../modules/generation/drizzle-stores.js";
import {
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
  DrizzleModuleStore,
  DrizzleLessonStore,
  DrizzleProgressStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
} from "../modules/study/drizzle-stores.js";
import { DrizzleCourseStore } from "../modules/courses/drizzle-stores.js";

describe("Real PostgreSQL E2E Flow: Quiz Review Publish -> Exam Topics -> Start Exam", () => {
  const dbUrl = process.env.DATABASE_URL ?? `postgres://${"avana"}:${"avana"}@127.0.0.1:5432/avana?sslmode=disable`;
  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.close().catch(() => {});
    }
  });

  it("completes full real Postgres Quiz publish & exam journey without error", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }
    const { db } = client;
    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const docId = randomUUID() as DocumentId;
    const actor: Actor = { userId: randomUUID() as UserId, role: "organization_admin" };

    // 1. Setup Organization & Course in DB
    await db.insert(schema.organizations).values({
      id: orgId,
      name: "E2E Postgres Org",
      slug: `e2e-org-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.users).values({
      id: actor.userId,
      email: `e2e-user-${actor.userId.slice(0, 8)}@test.com`,
      name: "E2E User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.courses).values({
      id: courseId,
      organizationId: orgId,
      name: "دوره جامع فارماکولوژی",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schema.documents).values({
      id: docId,
      organizationId: orgId,
      courseId: courseId,
      ownerUserId: actor.userId,
      originalName: "فارماکولوژی_قلب.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      sha256: "sha256_e2e",
      storageKey: "/storage/cardio.pdf",
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Insert Generated Content Draft (Quiz) in DB
    const contentId = randomUUID() as GeneratedContentId;
    await db.insert(schema.generatedContents).values({
      id: contentId,
      organizationId: orgId,
      courseId: courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        title: "آزمون فارماکولوژی قلب و عروق",
        difficulty: "medium",
        questions: [
          {
            question: "کدام دارو جزو داروهای بتابلاکر انتخابی قلب (β1) است؟",
            questionType: "multiple_choice",
            choices: ["آتنولول", "پروپرانولول", "لبتالول", "کوردارون"],
            correctAnswer: "آتنولول",
            explanation: "آتنولول بتابلاکر اختصاصی β1 است.",
            difficulty: "medium",
          },
          {
            question: "مکانیسم اثر نیتروگلیسیرین چیست؟",
            questionType: "multiple_choice",
            choices: ["آزادکننده نیتریک اکسید (NO)", "بلوک‌کننده کانال کلسیم", "مهارکننده ACE", "آنتاگونیست گیرنده آلدوسترون"],
            correct_answer: "آزادکننده نیتریک اکسید (NO)",
            explanation: "نیتروگلیسیرین با آزاد کردن NO باعث اتساع عروق می‌شود.",
            difficulty: "easy",
          },
        ],
      },
      promptVersion: "1.0",
      model: "gemini-flash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Wire Real Drizzle Stores
    const generatedContentStore = new DrizzleGeneratedContentStore(db);
    const citationStore = new DrizzleGeneratedContentCitationStore(db);
    const documentStore = new DrizzleDocumentStore(db);
    const chunkStore = new DrizzleDocumentChunkStore(db);
    const moduleStore = new DrizzleModuleStore(db);
    const lessonStore = new DrizzleLessonStore(db);
    const quizStore = new DrizzleQuizStore(db);
    const quizQuestionStore = new DrizzleQuizQuestionStore(db);
    const quizAttemptStore = new DrizzleQuizAttemptStore(db);
    const flashcardStore = new DrizzleFlashcardStore(db);
    const flashcardReviewStore = new DrizzleFlashcardReviewStore(db);
    const courseStore = new DrizzleCourseStore(db);
    const progressStore = new DrizzleProgressStore(db);

    const dummyQueue = {
      enqueueGenerationJob: async () => ({ generationJobId: "job-e2e" }),
      getJobStatus: async () => null,
    } as unknown as GenerationQueueService;

    const reviewService = new ReviewService(
      generatedContentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      dummyQueue,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

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
      undefined,
      courseStore,
    );

    // STEP A: Publish Quiz
    const result = await reviewService.acceptContent(actor, orgId, contentId);
    expect(result.status).toBe("accepted");
    expect(result.content_id).toBe(contentId);

    // Verify record in generated_contents
    const [contentRecord] = await db
      .select()
      .from(schema.generatedContents)
      .where(eq(schema.generatedContents.id, contentId));
    expect(contentRecord.status).toBe("accepted");

    // Verify materialized Quiz in PostgreSQL
    const quizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.organizationId, orgId));
    expect(quizzes.length).toBe(1);
    expect(quizzes[0].title).toBe("آزمون فارماکولوژی قلب و عروق");
    expect(quizzes[0].topic).toContain("فارماکولوژی قلب");

    // Verify materialized Quiz Questions in PostgreSQL
    const questions = await db.select().from(schema.quizQuestions).where(eq(schema.quizQuestions.quizId, quizzes[0].id));
    expect(questions.length).toBe(2);
    expect(questions[0].topic).toContain("فارماکولوژی قلب");
    expect(questions[0].difficulty).toBe("medium");

    // STEP B: Fetch Exam Topics
    const topicsSummary = await studyService.getExamTopicSummary(actor, orgId);
    expect(topicsSummary.sections.length).toBeGreaterThan(0);
    const section = topicsSummary.sections[0];
    expect(section).toBeDefined();
    expect(section!.questionCount).toBe(2);

    // STEP C: Start Configured Exam
    const attempt = await studyService.startConfiguredExamAttempt(actor, orgId, {
      topics: ["فارماکولوژی قلب"],
      questionCount: 2,
      difficulty: "all",
    });

    expect(attempt.attemptId).toBeDefined();
    expect(attempt.questions.length).toBe(2);
  });
});
