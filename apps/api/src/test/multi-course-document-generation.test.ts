import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
  type UUID,
  asDocumentChunkId,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { CourseService } from "../modules/courses/course-service.js";
import { SourcePackService } from "../modules/source-packs/source-pack-service.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import type { GenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemorySourcePackStore } from "../modules/source-packs/in-memory-source-pack-store.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryFlashcardStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";
import type { ModelGateway } from "../modules/generation/model-gateway.js";
import type {
  CompletionRequest,
  CompletionResponse,
} from "../modules/generation/gateway/types.js";
import {
  isDocumentAssociatedWithCourse,
  assertDocumentAssociatedWithCourse,
} from "../modules/documents/document-course-association.js";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{ storageKey: string; uploadUrl: string | null; expiresAt: string }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: { storageKey: string; data: Buffer }): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async read(storageKey: string): Promise<Buffer> {
    return this.files.get(storageKey) ?? Buffer.from("dummy-pdf-content");
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }
}

class FlexibleMockGateway implements ModelGateway {
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const stage = req.stage;
    const schemaType = (req.jsonSchema as { type?: string } | undefined)?.type;
    const userPrompt = req.messages.find((m) => m.role === "user")?.content || "";

    if (stage === "planning" || schemaType === "content_plan" || userPrompt.includes("CONTENT PLANNING")) {
      return {
        text: JSON.stringify({
          kind: "content_plan",
          moduleTitle: "فصل مبانی فارماکولوژی",
          outline: [{ title: "جلسه ۱: اصول پایه", description: "توضیح فارماکوکینتیک" }],
          sourceTopics: [{ id: "top-1", title: "مفاهیم اولیه", description: "توضیحات", relevantChunkIds: ["chunk-1"] }],
          sessions: [
            {
              index: 0,
              title: "جلسه ۱: اصول پایه",
              description: "توضیح فارماکوکینتیک",
              relevantChunkIds: ["chunk-1"],
              targetFlashcardCount: 2,
              targetQuizCount: 2,
            },
          ],
          highYieldFacts: [{ id: "f1", fact: "نکته طلایی", sessionIndex: 0 }],
          citationChunkIds: ["chunk-1"],
        }),
        model: "mock-model",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    if (
      stage === "review_summary" ||
      schemaType === "review_summary" ||
      userPrompt.includes("REVIEW SUMMARY") ||
      userPrompt.includes("خلاصه مروری")
    ) {
      const isForce = userPrompt.includes("force") || userPrompt.includes("تجدید") || Math.random() > 0.5;
      return {
        text: JSON.stringify({
          kind: "review_summary",
          title: `خلاصه مروری کامل ${isForce ? "(نسخه بازتولید شده)" : "(نسخه اولیه)"}`,
          estimatedReadingMinutes: 10,
          overview: "خلاصه مباحث کلیدی برای آمادگی آزمون.",
          sections: [
            {
              title: "بخش ۱: نکات مهم",
              keyPoints: ["نکته یک", "نکته دو"],
              mechanisms: ["مکانیسم اثر"],
              classifications: ["دسته‌بندی دارویی"],
              comparisons: [
                {
                  conceptA: "داروی الف",
                  conceptB: "داروی ب",
                  keyDifferences: "تفاوت در متابولیسم",
                },
              ],
              memorizationPoints: ["فرمول و دوز کلیدی"],
              examPoints: ["تست قطعی آزمون"],
              citationChunkIds: ["chunk-1"],
            },
          ],
          finalTakeaways: ["جمع‌بندی نهایی مبحث"],
          citationChunkIds: ["chunk-1"],
        }),
        model: "mock-model",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    if (stage === "lesson" || schemaType === "lesson") {
      return {
        text: JSON.stringify({
          title: "جلسه ۱: اصول پایه و آموزش جامع",
          contentMarkdown: "# جلسه ۱: اصول پایه و آموزش جامع\n\nمتن آموزشی درس برای یادگیری عمیق.",
          citationChunkIds: ["chunk-1"],
        }),
        model: "mock-model",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    if (stage === "flashcard" || schemaType === "flashcards" || schemaType === "flashcards_batch") {
      return {
        text: JSON.stringify({
          kind: "flashcards",
          cards: [
            {
              question: "پرسش اول فارماکولوژی چیست؟",
              answer: "پاسخ اول فارماکولوژی مربوط به اصول پایه است.",
              cardType: "mechanism",
              difficulty: "medium",
              citationChunkIds: ["chunk-1"],
            },
            {
              question: "پرسش دوم فارماکولوژی چیست؟",
              answer: "پاسخ دوم فارماکولوژی در خصوص متابولیسم است.",
              cardType: "clinical",
              difficulty: "hard",
              citationChunkIds: ["chunk-1"],
            },
          ],
        }),
        model: "mock-model",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    if (stage === "quiz" || schemaType === "quizzes" || schemaType === "quizzes_batch") {
      return {
        text: JSON.stringify({
          kind: "quizzes",
          quizzes: [
            {
              title: "آزمون جلسه اول",
              questions: [
                {
                  stem: "کدام گزینه مکانیسم اصلی دارو را به درستی بیان می‌کند؟",
                  options: [
                    "مهار رقابتی آنزیم",
                    "فعال‌سازی آلوستریک",
                    "بلوک کانال یونی",
                    "تغییر نفوذپذیری غشا",
                  ],
                  correctAnswerIndex: 0,
                  explanation: "دارو از طریق مهار رقابتی آنزیم عمل می‌کند.",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            },
          ],
        }),
        model: "mock-model",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    return {
      text: JSON.stringify({ sessions: [{ title: "جلسه نمونه", contentMarkdown: "# نمونه" }] }),
      model: "mock-model",
      finishReason: "stop",
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }

  async execute() {
    return {
      text: JSON.stringify({ sessions: [{ title: "جلسه نمونه", contentMarkdown: "# نمونه" }] }),
      inputTokens: 100,
      outputTokens: 50,
    };
  }
}

describe("Multi-Course Document Sharing & Generation Invariants (E2E & Security)", () => {
  const org1Id = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const org2Id = "00000000-0000-0000-0000-000000000002" as OrganizationId;

  const courseAId = "11111111-1111-1111-1111-111111111111" as CourseId;
  const courseBId = "22222222-2222-2222-2222-222222222222" as CourseId;
  const courseCId = "33333333-3333-3333-3333-333333333333" as CourseId;

  const adminActor: Actor = {
    userId: "admin-user",
    role: "organization_admin",
    globalRole: "platform_admin",
    organizationId: org1Id,
    memberships: [{ organizationId: org1Id, role: "organization_admin" }],
  };

  const studentActor: Actor = {
    userId: "student-user",
    role: "student",
    globalRole: "student",
    organizationId: org1Id,
    memberships: [{ organizationId: org1Id, role: "student" }],
  };

  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let genCitationStore: InMemoryGeneratedContentCitationStore;
  let orgStore: InMemoryOrganizationStore;
  let userStore: InMemoryUserStore;
  let adminStore: InMemoryAdminStore;
  let sourcePackStore: InMemorySourcePackStore;
  let storage: FakeStorageProvider;
  let gateway: FlexibleMockGateway;

  let docService: DocumentService;
  let genService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let courseService: CourseService;
  let sourcePackService: SourcePackService;

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    genContentStore = new InMemoryGeneratedContentStore();
    genCitationStore = new InMemoryGeneratedContentCitationStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    sourcePackStore = new InMemorySourcePackStore(docStore);
    storage = new FakeStorageProvider();
    gateway = new FlexibleMockGateway();

    // Register org1
    orgStore.createWithAdminMembership({
      organization: {
        id: org1Id,
        name: "Org 1",
        slug: "org-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: org1Id,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Register org2 (for cross-org security test)
    orgStore.createWithAdminMembership({
      organization: {
        id: org2Id,
        name: "Org 2",
        slug: "org-2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: org2Id,
        userId: "org2-admin",
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    docService = new DocumentService(
      docStore,
      storage,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      genContentStore,
      undefined,
      flashcardStore,
      quizStore,
      courseStore,
      moduleStore,
      lessonStore,
      undefined,
      org1Id,
      sourcePackStore,
    );

    genService = new GenerationService(
      genContentStore,
      genCitationStore,
      gateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      org1Id,
    );
    genService.setSourcePackStore(sourcePackStore);

    sourcePackService = new SourcePackService({
      store: sourcePackStore,
      documentStore: docStore,
      courseStore: courseStore,
      generationService: genService,
      systemOrganizationId: org1Id,
    });

    courseService = new CourseService(
      courseStore,
      async () => ({ role: "organization_admin" }),
      defaultPolicy,
      undefined,
      org1Id,
      undefined,
      moduleStore,
      lessonStore,
      docStore,
      genContentStore,
      undefined,
      quizStore,
      flashcardStore,
      orgStore,
      userStore,
      sourcePackStore,
    );

    const mockQueue = {
      enqueueGenerationJob: async () => ({ generationJobId: randomUUID(), status: "pending" }),
      enqueue: async () => {},
      add: async () => {},
    } as unknown as GenerationQueue;

    reviewService = new ReviewService(
      genContentStore,
      genCitationStore,
      docStore,
      chunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      mockQueue,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      orgStore,
      undefined,
      undefined,
      undefined,
      org1Id,
      courseStore,
    );

    officialContentService = new OfficialContentService(
      undefined,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      docStore,
      genContentStore,
      genService,
      reviewService,
      adminStore,
      org1Id,
      undefined,
      undefined,
      undefined,
      sourcePackStore,
    );

    // Create courses A, B, C in org 1
    for (const [id, name] of [
      [courseAId, "دوره فارماکولوژی بالینی"],
      [courseBId, "دوره داروشناسی جامع"],
      [courseCId, "دوره فیزیولوژی و درمان"],
    ] as const) {
      await courseStore.create({
        course: {
          id,
          organizationId: org1Id,
          name,
          description: null,
          subject: "پزشکی",
          targetAcademicFields: [],
          status: "draft",
          isOfficial: true,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });
    }
  });

  describe("Condition 6: Complete End-to-End Multi-Course Flow with Full Isolation", () => {
    it("shares a single document across Course A and Course B, generates & accepts content in both, and proves Course A data is 100% untouched", async () => {
      const fileData = Buffer.from("PDF-SHARED-CONTENT-PHARMACOLOGY-101");

      // 1. Upload in Course A
      const uploadARes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "Pharmacology-Shared.pdf",
        mimeType: "application/pdf",
        sizeBytes: fileData.length,
        data: fileData,
        courseId: courseAId,
      });

      const sharedDocId = uploadARes.document.id;
      expect(uploadARes.duplicate).toBeFalsy();

      // Seed chunks and mark extracted
      await docStore.update({
        ...(await docStore.findByIdForOrganization(sharedDocId, org1Id))!,
        status: "extracted",
      });
      await chunkStore.createMany([
        {
          id: asDocumentChunkId("chunk-1" as unknown as UUID),
          documentId: sharedDocId,
          organizationId: org1Id,
          sequence: 0,
          heading: "مفاهیم پایه",
          content: "مفاهیم پایه فارماکوکینتیک و فارماکودینامیک داروهای قلبی عروقی.",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 50,
          contentHash: "hash-1",
          createdAt: new Date().toISOString(),
        },
      ]);

      // Direct assignment verified for Course A
      const assocA = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        sharedDocId,
        courseAId,
        org1Id,
      );
      expect(assocA.associated).toBe(true);
      expect(assocA.document?.courseId).toBe(courseAId);

      // 2. Re-upload same file in Course B (deduplication triggers and creates Course B Source Pack link)
      const uploadBRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "Pharmacology-Shared.pdf",
        mimeType: "application/pdf",
        sizeBytes: fileData.length,
        data: fileData,
        courseId: courseBId,
      });

      expect(uploadBRes.duplicate).toBe(true);
      expect(uploadBRes.document.id).toBe(sharedDocId);

      // Verify doc.courseId remained Course A (preserves existing attachment)
      const docAfterB = await docStore.findByIdForOrganization(sharedDocId, org1Id);
      expect(docAfterB?.courseId).toBe(courseAId);

      // Verify active Source Pack exists in Course B with this document
      const packsB = await sourcePackStore.listByCourse(courseBId, org1Id);
      expect(packsB.length).toBeGreaterThanOrEqual(1);
      const isLinkedToB = packsB.some((p) =>
        p.documents?.some((d) => d.documentId === sharedDocId),
      );
      expect(isLinkedToB).toBe(true);

      // Association check succeeds for Course B via Source Pack
      const assocB = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        sharedDocId,
        courseBId,
        org1Id,
      );
      expect(assocB.associated).toBe(true);

      // 3. Generate & Accept Content in Course A
      const genA = await genService.generateForDocument(adminActor, org1Id, sharedDocId, {
        types: ["lesson", "flashcard", "quiz"],
        courseId: courseAId,
      });
      expect(genA.contents.length).toBeGreaterThan(0);
      for (const c of genA.contents) {
        expect(c.course_id).toBe(courseAId);
      }

      // Generate review summary for Course A
      const summaryA = await genService.generateReviewSummaryDirect(adminActor, org1Id, sharedDocId, {
        courseId: courseAId,
      });
      expect(summaryA.course_id).toBe(courseAId);

      // Accept all drafts in Course A
      const draftsA = await genContentStore.listByDocument(sharedDocId, org1Id);
      const draftsInCourseA = draftsA.filter((d) => d.courseId === courseAId);
      expect(draftsInCourseA.length).toBeGreaterThanOrEqual(3); // lesson, flashcard, quiz, summary

      for (const d of draftsInCourseA) {
        await reviewService.acceptContent(adminActor, org11IdOrOrg1(org1Id), d.id);
      }

      // Snapshot Course A state
      const modulesA = await moduleStore.listByCourse(courseAId);
      expect(modulesA.length).toBe(1);
      expect(modulesA[0].courseId).toBe(courseAId);

      const lessonsA = await lessonStore.listByModule(modulesA[0].id);
      expect(lessonsA.length).toBe(1);

      const flashcardsA = await flashcardStore.listByCourse(courseAId);
      expect(flashcardsA.length).toBe(2);

      const quizzesA = await quizStore.listByCourse(courseAId);
      expect(quizzesA.length).toBe(1);

      const acceptedSummaryA = await genService.getReviewSummaryForDocument(
        adminActor,
        org1Id,
        sharedDocId,
        courseAId,
      );
      expect(acceptedSummaryA?.status).toBe("accepted");
      expect(acceptedSummaryA?.course_id).toBe(courseAId);
      const summaryAPayloadBefore = JSON.stringify(acceptedSummaryA?.payload);

      // 4. Generate & Accept Content in Course B (using the shared document)
      const genB = await genService.generateForDocument(adminActor, org1Id, sharedDocId, {
        types: ["lesson", "flashcard", "quiz"],
        courseId: courseBId,
      });
      expect(genB.contents.length).toBeGreaterThan(0);
      for (const c of genB.contents) {
        expect(c.course_id).toBe(courseBId);
      }

      const summaryB = await genService.generateReviewSummaryDirect(adminActor, org1Id, sharedDocId, {
        courseId: courseBId,
      });
      expect(summaryB.course_id).toBe(courseBId);

      // Accept drafts in Course B
      const draftsAfterB = await genContentStore.listByDocument(sharedDocId, org1Id);
      const draftsInCourseB = draftsAfterB.filter((d) => d.courseId === courseBId);
      expect(draftsInCourseB.length).toBeGreaterThanOrEqual(3);

      for (const d of draftsInCourseB) {
        await reviewService.acceptContent(adminActor, org1Id, d.id);
      }

      // 5. Regenerate Review Summary in Course B (with force = true)
      const regenSummaryB = await genService.generateReviewSummaryDirect(
        adminActor,
        org1Id,
        sharedDocId,
        {
          courseId: courseBId,
          force: true,
        },
      );
      expect(regenSummaryB.course_id).toBe(courseBId);
      expect(regenSummaryB.status).toBe("draft");

      // 6. VERIFY ZERO CROSS-COURSE POLLUTION & COURSE A INTEGRITY
      // Course A module count, IDs, and references are 100% unchanged
      const modulesAPost = await moduleStore.listByCourse(courseAId);
      expect(modulesAPost).toHaveLength(1);
      expect(modulesAPost[0].id).toBe(modulesA[0].id);

      // Course A lesson count and content are 100% unchanged
      const lessonsAPost = await lessonStore.listByModule(modulesA[0].id);
      expect(lessonsAPost).toHaveLength(1);
      expect(lessonsAPost[0].id).toBe(lessonsA[0].id);

      // Course A flashcards count is 100% unchanged
      const flashcardsAPost = await flashcardStore.listByCourse(courseAId);
      expect(flashcardsAPost).toHaveLength(2);
      for (const f of flashcardsAPost) {
        expect(f.courseId).toBe(courseAId);
      }

      // Course A quizzes count is 100% unchanged
      const quizzesAPost = await quizStore.listByCourse(courseAId);
      expect(quizzesAPost).toHaveLength(1);
      for (const q of quizzesAPost) {
        expect(q.courseId).toBe(courseAId);
      }

      // Course A review summary is STILL accepted, active, and strictly identical
      const summaryAPost = await genService.getReviewSummaryForDocument(
        adminActor,
        org1Id,
        sharedDocId,
        courseAId,
      );
      expect(summaryAPost?.id).toBe(acceptedSummaryA?.id);
      expect(summaryAPost?.status).toBe("accepted");
      expect(summaryAPost?.course_id).toBe(courseAId);
      expect(JSON.stringify(summaryAPost?.payload)).toBe(summaryAPayloadBefore);

      // Course B has its OWN independent module, lessons, flashcards, quizzes
      const modulesB = await moduleStore.listByCourse(courseBId);
      expect(modulesB).toHaveLength(1);
      expect(modulesB[0].id).not.toBe(modulesA[0].id);

      const flashcardsB = await flashcardStore.listByCourse(courseBId);
      expect(flashcardsB).toHaveLength(2);
      for (const f of flashcardsB) {
        expect(f.courseId).toBe(courseBId);
      }

      const quizzesB = await quizStore.listByCourse(courseBId);
      expect(quizzesB).toHaveLength(1);
      for (const q of quizzesB) {
        expect(q.courseId).toBe(courseBId);
      }

      // 7. Verify Content Status Service reflects independent status per course
      const statusA = await genService.getDocumentContentStatus(
        adminActor,
        org1Id,
        sharedDocId,
        courseAId,
      );
      expect(statusA.lesson.accepted).toBe(true);
      expect(statusA.flashcards.accepted).toBe(true);
      expect(statusA.exam.accepted).toBe(true);
      expect(statusA.review_summary?.accepted).toBe(true);

      const statusB = await genService.getDocumentContentStatus(
        adminActor,
        org1Id,
        sharedDocId,
        courseBId,
      );
      expect(statusB.lesson.accepted).toBe(true);
      // Course B still has active accepted summary until the new draft is accepted
      expect(statusB.review_summary?.accepted).toBe(true);
      expect(statusB.review_summary?.generated).toBe(true);
      expect(regenSummaryB.status).toBe("draft");
    });
  });

  describe("Condition 7: Security & Association Guards", () => {
    let docInCourseAId: DocumentId;

    beforeEach(async () => {
      const upload = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "biology.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        data: Buffer.from("biology-content"),
        courseId: courseAId,
      });
      docInCourseAId = upload.document.id;
      await docStore.update({
        ...(await docStore.findByIdForOrganization(docInCourseAId, org1Id))!,
        status: "extracted",
      });
      await chunkStore.createMany([
        {
          id: asDocumentChunkId("00000000-0000-0000-0000-0000000000b1" as UUID),
          documentId: docInCourseAId,
          organizationId: org1Id,
          sequence: 0,
          heading: "محتوای بیولوژی",
          content: "محتوای بیولوژی و فیزیولوژی پایه",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 20,
          contentHash: "hash-bio-1",
          createdAt: new Date().toISOString(),
        },
      ]);
    });

    it("rejects generation for a course if the document is NOT associated with it", async () => {
      // Document is in Course A, NOT in Course C
      await expect(
        genService.generateForDocument(adminActor, org1Id, docInCourseAId, {
          types: ["lesson"],
          courseId: courseCId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند متعلق به دوره دیگری است");
        return true;
      });

      // Also rejects in triggerOfficialGeneration
      await expect(
        officialContentService.triggerOfficialGeneration(adminActor, courseCId, docInCourseAId),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند متعلق به دوره دیگری است");
        return true;
      });

      // And rejects in generateReviewSummary
      await expect(
        genService.generateReviewSummaryDirect(adminActor, org1Id, docInCourseAId, {
          courseId: courseCId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند متعلق به دوره دیگری است");
        return true;
      });
    });

    it("rejects cross-organization document access strictly", async () => {
      // Trying to associate or generate using Org 1 document inside Org 2
      await expect(
        assertDocumentAssociatedWithCourse(
          { documentStore: docStore, sourcePackStore },
          docInCourseAId,
          courseAId,
          org2Id,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("not_found");
        expect(domErr.message).toContain("Document not found");
        return true;
      });
    });

    it("rejects non-admin actor from triggering official course generation", async () => {
      await expect(
        officialContentService.triggerOfficialGeneration(
          studentActor,
          courseAId,
          docInCourseAId,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("forbidden");
        return true;
      });
    });

    it("ignores archived or soft-deleted Source Pack links (Condition 3)", async () => {
      // Create a pack in Course C and add the document, but mark pack as archived
      const pack = await sourcePackStore.create({
        organizationId: org1Id,
        courseId: courseCId,
        title: "پک آرشیو شده",
        documents: [{ documentId: docInCourseAId, role: "primary_notes", orderIndex: 0 }],
      });

      // Update pack status to archived
      await sourcePackStore.update(pack.id, org1Id, { status: "archived" });

      const checkArchived = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        docInCourseAId,
        courseCId,
        org1Id,
      );
      expect(checkArchived.associated).toBe(false);

      // Now soft-delete the pack
      await sourcePackStore.delete(pack.id, org1Id);

      const checkDeleted = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        docInCourseAId,
        courseCId,
        org1Id,
      );
      expect(checkDeleted.associated).toBe(false);
    });

    it("detaching document from Course B leaves Course A untouched and blocks subsequent Course B generation", async () => {
      // 1. Attach to Course B
      const packB = await sourcePackStore.create({
        organizationId: org1Id,
        courseId: courseBId,
        title: "منابع درس ب",
        documents: [{ documentId: docInCourseAId, role: "primary_notes", orderIndex: 0 }],
      });

      const assocBefore = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        docInCourseAId,
        courseBId,
        org1Id,
      );
      expect(assocBefore.associated).toBe(true);

      // 2. Detach document from Course B pack (remove documents from pack)
      await sourcePackStore.update(packB.id, org1Id, {
        documents: [],
      });

      // Course B association is now invalid
      const assocBAfter = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        docInCourseAId,
        courseBId,
        org1Id,
      );
      expect(assocBAfter.associated).toBe(false);

      // Subsequent generation in Course B is rejected
      await expect(
        genService.generateForDocument(adminActor, org1Id, docInCourseAId, {
          types: ["lesson"],
          courseId: courseBId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        return true;
      });

      // Course A direct assignment remains 100% valid!
      const assocAAfter = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        docInCourseAId,
        courseAId,
        org1Id,
      );
      expect(assocAAfter.associated).toBe(true);
      expect(assocAAfter.document?.courseId).toBe(courseAId);

      // Generation in Course A still succeeds
      const genA = await genService.generateForDocument(adminActor, org1Id, docInCourseAId, {
        types: ["lesson"],
        courseId: courseAId,
      });
      expect(genA.contents).toHaveLength(1);
      expect(genA.contents[0].course_id).toBe(courseAId);
    });
  });

  describe("Condition 8 & Regression: Manual Module Creation and Direct Source Pack Attachment", () => {
    it("successfully attaches a Course A document directly to Course B Source Pack, preserving Course A attachment", async () => {
      // 1. Upload in Course A
      const uploadRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "cardio.pdf",
        mimeType: "application/pdf",
        sizeBytes: 150,
        data: Buffer.from("cardio-content"),
        courseId: courseAId,
      });
      const cardioDocId = uploadRes.document.id;

      // 2. Attach directly to Course B Source Pack using SourcePackService.createPack
      const packB = await sourcePackService.createPack(adminActor, org1Id, courseBId, {
        title: "پک فارماکولوژی قلب دوره ب",
        documents: [{ documentId: cardioDocId, role: "primary" }],
      });
      expect(packB.id).toBeDefined();
      expect(packB.courseId).toBe(courseBId);
      expect(packB.documents).toHaveLength(1);
      expect(packB.documents[0].documentId).toBe(cardioDocId);

      // 3. Confirm Course A attachment is preserved in document record
      const docRecord = await docStore.findByIdForOrganization(cardioDocId, org1Id);
      expect(docRecord?.courseId).toBe(courseAId);

      // 4. Confirm document is actively associated with Course B
      const assocB = await isDocumentAssociatedWithCourse(
        { documentStore: docStore, sourcePackStore },
        cardioDocId,
        courseBId,
        org1Id,
      );
      expect(assocB.associated).toBe(true);
    });

    it("allows manual module creation in Course B using a shared document", async () => {
      // 1. Upload document in Course A
      const uploadRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "neuro.pdf",
        mimeType: "application/pdf",
        sizeBytes: 200,
        data: Buffer.from("neuro-content"),
        courseId: courseAId,
      });
      const neuroDocId = uploadRes.document.id;

      // 2. Attach to Course B Source Pack
      await sourcePackService.createPack(adminActor, org1Id, courseBId, {
        title: "پک اعصاب دوره ب",
        documents: [{ documentId: neuroDocId, role: "primary" }],
      });

      // 3. Manually create a module in Course B linked to neuroDocId
      const moduleB = await courseService.createModule(adminActor, org1Id, courseBId, {
        title: "فصل مبانی نوروفارماکولوژی",
        documentId: neuroDocId,
      });

      expect(moduleB.id).toBeDefined();
      expect(moduleB.courseId).toBe(courseBId);
      expect(moduleB.documentId).toBe(neuroDocId);
    });

    it("allows updating a module in Course B and linking it to a shared document", async () => {
      // 1. Upload document in Course A
      const uploadRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "endocrine.pdf",
        mimeType: "application/pdf",
        sizeBytes: 220,
        data: Buffer.from("endocrine-content"),
        courseId: courseAId,
      });
      const endocrineDocId = uploadRes.document.id;

      // 2. Attach to Course B Source Pack
      await sourcePackService.createPack(adminActor, org1Id, courseBId, {
        title: "پک غدد دوره ب",
        documents: [{ documentId: endocrineDocId, role: "primary" }],
      });

      // 3. Create an empty module in Course B
      const initialModule = await courseService.createModule(adminActor, org1Id, courseBId, {
        title: "فصل بدون سند",
      });
      expect(initialModule.documentId).toBeNull();

      // 4. Update the module to link to the shared endocrineDocId
      const updatedModule = await courseService.updateModule(
        adminActor,
        org1Id,
        courseBId,
        initialModule.id,
        {
          title: "فصل غدد و متابولیسم",
          documentId: endocrineDocId,
        },
      );

      expect(updatedModule.id).toBe(initialModule.id);
      expect(updatedModule.documentId).toBe(endocrineDocId);
    });

    it("strictly rejects documents from another organization in both SourcePackService and CourseService", async () => {
      // 1. Upload document in Org 2
      const org2Actor: Actor = {
        userId: "org2-admin",
        role: "organization_admin",
        globalRole: "student",
        organizationId: org2Id,
        memberships: [{ organizationId: org2Id, role: "organization_admin" }],
      };
      const uploadRes = await docService.confirmUpload(org2Actor, org2Id, {
        originalName: "org2-secret.pdf",
        mimeType: "application/pdf",
        sizeBytes: 300,
        data: Buffer.from("org2-secret"),
      });
      const org2DocId = uploadRes.document.id;

      // 2. Attempt to add to Source Pack in Org 1 -> Rejects with not_found
      await expect(
        sourcePackService.createPack(adminActor, org1Id, courseBId, {
          title: "پک نفوذ",
          documents: [{ documentId: org2DocId, role: "primary" }],
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("not_found");
        return true;
      });

      // 3. Attempt to link to CourseModule in Org 1 -> Rejects with not_found
      await expect(
        courseService.createModule(adminActor, org1Id, courseBId, {
          title: "ماژول نفوذ",
          documentId: org2DocId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("not_found");
        return true;
      });
    });

    it("rejects manual module creation in Course C if document is not associated with Course C", async () => {
      // Document is in Course A, NOT associated with Course C
      const uploadRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "renal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 180,
        data: Buffer.from("renal-content"),
        courseId: courseAId,
      });
      const renalDocId = uploadRes.document.id;

      await expect(
        courseService.createModule(adminActor, org1Id, courseCId, {
          title: "ماژول کلیه در دوره نامرتبط",
          documentId: renalDocId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند متعلق به دوره دیگری است");
        return true;
      });
    });

    it("detaching document from Course B Source Pack preserves Course A association and invalidates Course B module operations", async () => {
      // 1. Upload in Course A
      const uploadRes = await docService.confirmUpload(adminActor, org1Id, {
        originalName: "respiratory.pdf",
        mimeType: "application/pdf",
        sizeBytes: 190,
        data: Buffer.from("respiratory-content"),
        courseId: courseAId,
      });
      const respDocId = uploadRes.document.id;

      // 2. Attach to Course B Source Pack
      const packB = await sourcePackService.createPack(adminActor, org1Id, courseBId, {
        title: "پک تنفس دوره ب",
        documents: [{ documentId: respDocId, role: "primary" }],
      });

      // Association check is true for both A and B
      expect(
        (await isDocumentAssociatedWithCourse({ documentStore: docStore, sourcePackStore }, respDocId, courseAId, org1Id)).associated,
      ).toBe(true);
      expect(
        (await isDocumentAssociatedWithCourse({ documentStore: docStore, sourcePackStore }, respDocId, courseBId, org1Id)).associated,
      ).toBe(true);

      // 3. Delete Course B Source Pack
      await sourcePackService.deletePack(adminActor, org1Id, courseBId, packB.id);

      // Course B association is now false
      expect(
        (await isDocumentAssociatedWithCourse({ documentStore: docStore, sourcePackStore }, respDocId, courseBId, org1Id)).associated,
      ).toBe(false);

      // Attempting to create module in Course B now fails
      await expect(
        courseService.createModule(adminActor, org1Id, courseBId, {
          title: "تلاش بعد از حذف پک",
          documentId: respDocId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        return true;
      });

      // Course A association is still 100% active
      expect(
        (await isDocumentAssociatedWithCourse({ documentStore: docStore, sourcePackStore }, respDocId, courseAId, org1Id)).associated,
      ).toBe(true);

      // Manual module creation in Course A still succeeds
      const moduleA = await courseService.createModule(adminActor, org1Id, courseAId, {
        title: "ماژول تنفس دوره الف",
        documentId: respDocId,
      });
      expect(moduleA.id).toBeDefined();
      expect(moduleA.courseId).toBe(courseAId);
    });
  });
});

function org11IdOrOrg1(orgId: OrganizationId): OrganizationId {
  return orgId;
}
