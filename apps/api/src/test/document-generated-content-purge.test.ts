import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import {
  documents,
  documentChunks,
  courses,
  modules,
  lessons,
  quizzes,
  quizQuestions,
  flashcards,
  generatedContents,
  generationJobs,
  organizations,
  users,
} from "@avana/database/schema";
import { eq } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import { randomUUID } from "node:crypto";

describe("Document Generated Content Purge Tests", () => {
  let db: any;
  let service: OfficialContentService;
  let systemOrgId: string;
  let adminUserId: string;
  let testCourseId: string;
  let testDocId: string;

  const adminActor = {
    userId: "" as any,
    role: "platform_admin" as const,
    globalRole: "platform_admin" as const,
  };

  beforeEach(async () => {
    const { resolveSafePostgresTestUrl } = await import("./pg-test-guard.js");
    const databaseUrl = resolveSafePostgresTestUrl();
    const client = createDbClient(databaseUrl);
    db = client.db;

    systemOrgId = randomUUID();
    adminUserId = randomUUID();
    adminActor.userId = adminUserId as any;
    testCourseId = randomUUID();
    testDocId = randomUUID();

    await db.insert(organizations).values({
      id: systemOrgId,
      name: "AVANA System Org",
      slug: `org-${systemOrgId.slice(0, 8)}`,
    });

    await db.insert(users).values({
      id: adminUserId,
      email: `admin-${adminUserId.slice(0, 8)}@avana.test`,
      name: "Admin User",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });

    await db.insert(courses).values({
      id: testCourseId,
      organizationId: systemOrgId,
      name: "Test Purge Course",
      subject: "Medicine",
      status: "draft",
    });

    service = new OfficialContentService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      systemOrgId as any,
    );
  });

  afterEach(async () => {
    try {
      await db.delete(courses).where(eq(courses.id, testCourseId));
      await db.delete(organizations).where(eq(organizations.id, systemOrgId));
      await db.delete(users).where(eq(users.id, adminUserId));
    } catch {
      // Ignore cleanup error
    }
  });

  it("1. Rejects purge with 409 conflict when document status is 'generating'", async () => {
    await db.insert(documents).values({
      id: testDocId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      ownerUserId: adminUserId,
      originalName: "medical_handbook.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "sha_" + randomUUID().replace(/-/g, ""),
      storageKey: `docs/${testDocId}.pdf`,
      status: "generating",
    });

    await expect(
      service.purgeGeneratedContentForDocument(adminActor, testCourseId as any, testDocId),
    ).rejects.toThrowError(
      "تا زمانی که تولید محتوا از این فایل به پایان نرسیده است، امکان حذف آن وجود ندارد.",
    );

    const [doc] = await db.select().from(documents).where(eq(documents.id, testDocId));
    expect(doc.status).toBe("generating");
  });

  it("2. Rejects purge with 409 conflict when generation_jobs has active status", async () => {
    await db.insert(documents).values({
      id: testDocId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      ownerUserId: adminUserId,
      originalName: "cardiology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "sha_" + randomUUID().replace(/-/g, ""),
      storageKey: `docs/${testDocId}.pdf`,
      status: "extracted",
    });

    const activeJobId = randomUUID();
    await db.insert(generationJobs).values({
      id: activeJobId,
      organizationId: systemOrgId,
      documentId: testDocId,
      courseId: testCourseId,
      type: "lesson",
      status: "running",
      payload: {},
    });

    await expect(
      service.purgeGeneratedContentForDocument(adminActor, testCourseId as any, testDocId),
    ).rejects.toThrowError(
      "تا زمانی که تولید محتوا از این فایل به پایان نرسیده است، امکان حذف آن وجود ندارد.",
    );

    await db.delete(generationJobs).where(eq(generationJobs.id, activeJobId));
  });

  it("3. Successfully purges generated contents, preserves source document & chunks, resets status to 'extracted'", async () => {
    await db.insert(documents).values({
      id: testDocId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      ownerUserId: adminUserId,
      originalName: "pharmacology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: "sha_" + randomUUID().replace(/-/g, ""),
      storageKey: `docs/${testDocId}.pdf`,
      status: "ready",
    });

    const chunkId = randomUUID();
    await db.insert(documentChunks).values({
      id: chunkId,
      documentId: testDocId,
      organizationId: systemOrgId,
      sequence: 1,
      content: "Important pharmacology notes chunk",
      contentHash: "hash_" + randomUUID().replace(/-/g, ""),
      startPage: 1,
      endPage: 2,
      tokenEstimate: 120,
    });

    const moduleId = randomUUID();
    await db.insert(modules).values({
      id: moduleId,
      courseId: testCourseId,
      documentId: testDocId,
      title: "فصل ۱: داروشناسی",
      sortOrder: 1,
    });

    const manualLessonId = randomUUID();
    await db.insert(lessons).values({
      id: manualLessonId,
      moduleId,
      title: "درس دستی مدرس",
      contentMarkdown: "این درس را مدرس به صورت دستی ایجاد کرده است.",
      sortOrder: 1,
      publicationStatus: "published",
    });

    const aiLessonId = randomUUID();
    await db.insert(lessons).values({
      id: aiLessonId,
      moduleId,
      title: "درس تولیدشده هوش مصنوعی",
      contentMarkdown: "محتوای تولیدشده با AI",
      sortOrder: 2,
      publicationStatus: "published",
    });

    const genContentId = randomUUID();
    await db.insert(generatedContents).values({
      id: genContentId,
      organizationId: systemOrgId,
      documentId: testDocId,
      courseId: testCourseId,
      type: "lesson",
      status: "accepted",
      payload: { title: "درس تولیدشده هوش مصنوعی" },
      promptVersion: "v1",
      model: "gemini",
      materializedLessonId: aiLessonId,
    });

    const quizId = randomUUID();
    await db.insert(quizzes).values({
      id: quizId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      documentId: testDocId,
      title: "کوییز فارماکولوژی",
      status: "published",
    });

    await db.insert(quizQuestions).values({
      id: randomUUID(),
      quizId,
      question: "دوز موثر دارو چیست؟",
      correctAnswer: "گزینه ۱",
    });

    const cardId = randomUUID();
    await db.insert(flashcards).values({
      id: cardId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      documentId: testDocId,
      question: "مکانیسم اثر بتا بلوکرها",
      answer: "مهار گیرنده‌های بتا آدرنرژیک",
    });

    const purgeResult = await service.purgeGeneratedContentForDocument(
      adminActor,
      testCourseId as any,
      testDocId,
    );

    expect(purgeResult.success).toBe(true);
    expect(purgeResult.documentStatus).toBe("extracted");
    expect(purgeResult.deletedSummary.lessonsCount).toBe(1);
    expect(purgeResult.deletedSummary.quizzesCount).toBe(1);
    expect(purgeResult.deletedSummary.flashcardsCount).toBe(1);
    expect(purgeResult.deletedSummary.generatedContentsCount).toBe(1);

    const [savedDoc] = await db.select().from(documents).where(eq(documents.id, testDocId));
    expect(savedDoc).toBeDefined();
    expect(savedDoc.status).toBe("extracted");

    const [savedChunk] = await db.select().from(documentChunks).where(eq(documentChunks.id, chunkId));
    expect(savedChunk).toBeDefined();

    const [savedManualLesson] = await db.select().from(lessons).where(eq(lessons.id, manualLessonId));
    expect(savedManualLesson).toBeDefined();

    const aiLessonRows = await db.select().from(lessons).where(eq(lessons.id, aiLessonId));
    expect(aiLessonRows.length).toBe(0);

    const quizRows = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
    expect(quizRows.length).toBe(0);

    const cardRows = await db.select().from(flashcards).where(eq(flashcards.id, cardId));
    expect(cardRows.length).toBe(0);

    const genRows = await db.select().from(generatedContents).where(eq(generatedContents.id, genContentId));
    expect(genRows.length).toBe(0);
  });

  it("4. Idempotency: Repeating purge on already purged document succeeds without errors", async () => {
    await db.insert(documents).values({
      id: testDocId,
      organizationId: systemOrgId,
      courseId: testCourseId,
      ownerUserId: adminUserId,
      originalName: "pathology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "sha_" + randomUUID().replace(/-/g, ""),
      storageKey: `docs/${testDocId}.pdf`,
      status: "extracted",
    });

    const secondPurge = await service.purgeGeneratedContentForDocument(
      adminActor,
      testCourseId as any,
      testDocId,
    );

    expect(secondPurge.success).toBe(true);
    expect(secondPurge.deletedSummary.lessonsCount).toBe(0);
    expect(secondPurge.deletedSummary.quizzesCount).toBe(0);
    expect(secondPurge.deletedSummary.flashcardsCount).toBe(0);
  });
});
