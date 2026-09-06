import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type OrganizationId,
  asUserId,
  asOrganizationId,
  defaultPolicy,
} from "@avana/domain";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { DomainError } from "@avana/domain";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { CourseService } from "../modules/courses/course-service.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";

describe("AVANA Official Content Pipeline — Production Readiness (18 Scenarios)", () => {
  const officialOrgId = asOrganizationId("b4a0b464-16db-4087-92b7-163a1e6f6776");
  const adminActor: Actor = {
    userId: asUserId("admin-ops-user"),
    role: "platform_admin",
  };
  const studentActor: Actor = {
    userId: asUserId("student-buyer-user"),
    role: "student",
  };

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let orgStore: InMemoryOrganizationStore;

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let courseService: CourseService;
  let learningService: LearningService;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  beforeEach(async () => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore();
    orgStore = new InMemoryOrganizationStore();

    modelGateway = new MockModelGateway();

    // Canonical Generation Service with exact existing architecture
    generationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      modelGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    // Canonical Review Service directly reusing materialization
    reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      documentStore,
      documentChunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      { addJob: async () => ({ id: "mock-job-1" }) } as any,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    const courseProducts = new Map<string, any>();

    const extractKeyValuePairs = (sqlObj: any, result: Record<string, any> = {}): Record<string, any> => {
      if (!sqlObj) return result;
      if (sqlObj.queryChunks && Array.isArray(sqlObj.queryChunks)) {
        const chunks = sqlObj.queryChunks;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk && chunk.queryChunks) {
            extractKeyValuePairs(chunk, result);
          } else if (chunk && chunk.name && i + 2 < chunks.length && chunks[i + 2] && chunks[i + 2].value !== undefined) {
            result[chunk.name] = chunks[i + 2].value;
          }
        }
      }
      return result;
    };

    const evaluateCondition = (p: any, cond: any): boolean => {
      if (!cond) return true;
      const pairs = extractKeyValuePairs(cond);
      for (const [colName, val] of Object.entries(pairs)) {
        if (colName === "code" && p.code !== val) return false;
        if (colName === "id" && p.id !== val) return false;
        if ((colName === "target_id" || colName === "targetId") && p.targetId !== val) return false;
        if ((colName === "target_type" || colName === "targetType") && p.targetType !== val) return false;
        if ((colName === "deleted_at" || colName === "deletedAt") && (p.deletedAt ?? null) !== (val ?? null)) return false;
      }
      return true;
    };

    const findMatching = (cond?: any) => {
      const all = Array.from(courseProducts.values());
      if (!cond) return all;
      return all.filter((p) => evaluateCondition(p, cond));
    };

    const mockDb: any = {
      select: () => ({
        from: (_table: any) => ({
          where: (condition: any) => ({
            limit: async (lim?: number) => {
              const matched = findMatching(condition);
              return typeof lim === "number" ? matched.slice(0, lim) : matched;
            },
          }),
        }),
      }),
      insert: () => ({
        values: (val: any) => ({
          returning: async () => {
            const p = await commerceStore.createProduct({
              id: val.id || randomUUID(),
              code: val.code,
              type: val.type || "course",
              title: val.title,
              description: val.description || null,
              price: val.price,
              currency: val.currency || "toman",
              targetType: val.targetType || "course",
              targetId: val.targetId || null,
              durationDays: val.durationDays || null,
              active: val.active ?? false,
              metadata: val.metadata || {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
            });
            courseProducts.set(p.id, p);
            return [p];
          },
        }),
      }),
      update: () => ({
        set: (vals: any) => ({
          where: (cond: any) => ({
            returning: async () => {
              const matched = findMatching(cond);
              if (matched.length > 0) {
                const target = matched[0];
                const updated = {
                  ...target,
                  ...vals,
                  updatedAt: new Date().toISOString(),
                };
                courseProducts.set(target.id, updated);
                const idx = commerceStore.products.findIndex(
                  (p) => p.id === target.id,
                );
                if (idx >= 0) {
                  commerceStore.products[idx] = updated;
                }
                return [updated];
              }
              return [];
            },
          }),
        }),
      }),
    };

    officialContentService = new OfficialContentService(
      mockDb,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      generationService,
      reviewService,
      adminStore,
      officialOrgId,
    );

    commerceService = new CommerceService(commerceStore, new MockPaymentGateway());

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    });

    courseService = new CourseService(
      courseStore,
      async (_actor, orgId) => {
        if (orgId === officialOrgId) return { role: _actor.role };
        return { role: "student" };
      },
      defaultPolicy,
      undefined,
      officialOrgId,
    );

    learningService = new LearningService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      undefined,
      officialOrgId,
      entitlementService,
    );
  });

  // Helper to create an uploaded document with chunks
  async function setupDocument(courseId: CourseId, docName = "pharmacology_source.pdf") {
    const docId = randomUUID();
    await documentStore.create({
      id: docId,
      organizationId: officialOrgId,
      courseId,
      ownerUserId: adminActor.userId,
      originalName: docName,
      mimeType: "application/pdf",
      sizeBytes: 10240,
      sha256: `hash_${docId}`,
      storageKey: `docs/${docName}`,
      pageCount: 1,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await documentChunkStore.createMany([
      {
        id: randomUUID(),
        documentId: docId,
        organizationId: officialOrgId,
        sequence: 0,
        content: "مباحث فارماکوکینتیک شامل جذب، توزیع، متابولیسم و دفع داروها در بدن انسان است.",
        tokenEstimate: 15,
        heading: "مقدمه فارماکوکینتیک",
        startPage: 1,
        endPage: 1,
        contentHash: "hash1",
        createdAt: new Date().toISOString(),
      },
    ]);

    return docId;
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: Create official course
  // ---------------------------------------------------------------------------
  it("Scenario 1: Create official course in draft status under official org", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکولوژی بالینی آوانا",
      subject: "داروسازی",
      description: "دوره رسمی و تجاری آوانا",
    });

    expect(course.id).toBeDefined();
    expect(course.organizationId).toBe(officialOrgId);
    expect(course.status).toBe("draft");
    expect(course.isOfficial).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Generate content using existing AI pipeline
  // ---------------------------------------------------------------------------
  it("Scenario 2: Generate content using existing GenerationService & ModelGateway", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "شیمی دارویی ۱",
    });
    const docId = await setupDocument(course.id);

    const result = await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    expect(result.status).toBe("review");

    const updatedCourse = await courseStore.findById(course.id);
    expect(updatedCourse?.status).toBe("review");

    const drafts = await generatedContentStore.listByCourse(course.id, officialOrgId);
    expect(drafts.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Successful lesson mapping
  // ---------------------------------------------------------------------------
  it("Scenario 3: Successful lesson mapping gives 0 unresolved mappings", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکوگنوزی",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);

    const workspace = await officialContentService.getReviewWorkspace(adminActor, course.id);
    expect(workspace.unresolvedLessonMappings).toBe(0);
    expect(workspace.readyForApproval).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Unresolved mapping blocks approval
  // ---------------------------------------------------------------------------
  it("Scenario 4: Unresolved mapping blocks approval", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره با خطای نگاشت",
    });
    const docId = await setupDocument(course.id);

    // Create an invalid draft flashcard without sessionIndex or topic
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: officialOrgId,
      documentId: docId,
      courseId: course.id,
      type: "flashcard",
      status: "pending_review",
      promptVersion: "v1",
      model: "mock-1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      payload: {
        cards: [
          { front: "کارت بدون سرفصل و جلسه", back: "پاسخ" },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const workspace = await officialContentService.getReviewWorkspace(adminActor, course.id);
    expect(workspace.unresolvedLessonMappings).toBeGreaterThan(0);
    expect(workspace.readyForApproval).toBe(false);

    await expect(
      officialContentService.approveOfficialCourse(adminActor, course.id),
    ).rejects.toThrow("امکان تایید دوره وجود ندارد");
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: No lesson_id blocks approval
  // ---------------------------------------------------------------------------
  it("Scenario 5: Flashcard without lesson_id fails invariant check and blocks approval", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره بدون درس معتبر",
    });
    const docId = await setupDocument(course.id);

    // Create flashcard with a non-existent lesson reference
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: officialOrgId,
      documentId: docId,
      courseId: course.id,
      type: "flashcard",
      status: "draft",
      promptVersion: "v1",
      model: "mock-1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      payload: {
        cards: [
          { sessionIndex: 999, front: "سوال غیرقابل نگاشت", back: "جواب" },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Approval must fail invariant check when materialized without a valid lesson
    await expect(
      officialContentService.approveOfficialCourse(adminActor, course.id),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: No module_id blocks approval
  // ---------------------------------------------------------------------------
  it("Scenario 6: Approval fails when drafts cannot map to valid modules/lessons", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره بدون ماژول",
    });
    const docId = await setupDocument(course.id);

    // Create a standalone flashcard draft with no lesson draft in the course
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: officialOrgId,
      documentId: docId,
      courseId: course.id,
      type: "flashcard",
      status: "draft",
      promptVersion: "v1",
      model: "mock-1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      payload: {
        cards: [
          { sessionIndex: 1, front: "سوال بدون درس", back: "جواب" },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      officialContentService.approveOfficialCourse(adminActor, course.id),
    ).rejects.toThrow("فاقد اتصال معتبر به درس است");
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: Approval materializes content exactly once
  // ---------------------------------------------------------------------------
  it("Scenario 7: Approval materializes content exactly once into learning core", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکولوژی ۱",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);

    const approvalResult = await officialContentService.approveOfficialCourse(adminActor, course.id);
    expect(approvalResult.approved).toBe(true);
    expect(approvalResult.materialized.modules).toBeGreaterThan(0);
    expect(approvalResult.materialized.lessons).toBeGreaterThan(0);
    expect(approvalResult.materialized.flashcards).toBeGreaterThan(0);
    expect(approvalResult.materialized.questions).toBeGreaterThan(0);

    const approvedCourse = await courseStore.findById(course.id);
    expect(approvedCourse?.status).toBe("approved");
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Re-running approval does not duplicate content
  // ---------------------------------------------------------------------------
  it("Scenario 8: Re-running approval does not duplicate content", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکولوژی ۲",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);

    const run1 = await officialContentService.approveOfficialCourse(adminActor, course.id);
    const run2 = await officialContentService.approveOfficialCourse(adminActor, course.id);

    expect(run2.approved).toBe(true);
    expect(run2.materialized.modules).toBe(run1.materialized.modules);
    expect(run2.materialized.lessons).toBe(run1.materialized.lessons);
    expect(run2.materialized.flashcards).toBe(run1.materialized.flashcards);
    expect(run2.materialized.questions).toBe(run1.materialized.questions);
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Re-running generation does not create duplicate content
  // ---------------------------------------------------------------------------
  it("Scenario 9: Re-running generation recognizes existing content and avoids duplicate piles", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکولوژی ۳",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);

    const initialDrafts = await generatedContentStore.listByCourse(course.id, officialOrgId);

    // Re-triggering generation returns without crashing or creating duplicate drafts of the same types
    await expect(
      officialContentService.triggerOfficialGeneration(adminActor, course.id, docId),
    ).rejects.toThrow("تمام محتواهای درخواستی از قبل برای این فایل وجود دارند");

    const afterDrafts = await generatedContentStore.listByCourse(course.id, officialOrgId);
    expect(afterDrafts.length).toBe(initialDrafts.length);
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Pricing
  // ---------------------------------------------------------------------------
  it("Scenario 10: Pricing creates inactive product with correct code and amount", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماسیوتیکس ۱",
    });

    const product = await officialContentService.setProductPricing(adminActor, course.id, {
      price: 350000,
      title: "دوره جامع فارماسیوتیکس",
    });

    expect(product.code).toBe(`course_${course.id}`);
    expect(product.price).toBe(350000);
    expect(product.active).toBe(false); // Inactive until publish
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: Validation
  // ---------------------------------------------------------------------------
  it("Scenario 11: Validation passes when approved, priced, and zero unmapped items", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماسیوتیکس ۲",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    await officialContentService.setProductPricing(adminActor, course.id, { price: 350000 });

    const report = await officialContentService.validateConsistency(course.id);
    expect(report.valid).toBe(true);
    expect(report.errors.length).toBe(0);
    expect(report.unresolvedLessonMappings).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 12: Publish
  // ---------------------------------------------------------------------------
  it("Scenario 12: Publish sets course to published and activates product", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "سم‌شناسی ۱",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    await officialContentService.setProductPricing(adminActor, course.id, { price: 290000 });

    const published = await officialContentService.publishOfficialCourse(adminActor, course.id);
    expect(published.success).toBe(true);
    expect(published.course.status).toBe("published");
    expect(published.product.active).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 13: Publish is idempotent
  // ---------------------------------------------------------------------------
  it("Scenario 13: Re-running publish is idempotent", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "سم‌شناسی ۲",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    await officialContentService.setProductPricing(adminActor, course.id, { price: 290000 });

    const pub1 = await officialContentService.publishOfficialCourse(adminActor, course.id);
    const pub2 = await officialContentService.publishOfficialCourse(adminActor, course.id);

    expect(pub2.success).toBe(true);
    expect(pub2.course.status).toBe("published");
    expect(pub2.product.active).toBe(true);
    expect(pub2.product.id).toBe(pub1.product.id);
  });

  // ---------------------------------------------------------------------------
  // Scenario 14: Unpublished course is inaccessible to student
  // ---------------------------------------------------------------------------
  it("Scenario 14: Unpublished course is inaccessible to student", async () => {
    const draftCourse = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره پیش‌نویس محرمانه",
    });

    // Student trying to fetch course details via courseService
    await expect(
      courseService.getCourse(studentActor, officialOrgId, draftCourse.id),
    ).rejects.toThrow("Course not found");

    // Student trying to fetch course learning structure via learningService
    await expect(
      learningService.getCourseLearning(studentActor, draftCourse.id, "req-test"),
    ).rejects.toThrow("Course not found");
  });

  // ---------------------------------------------------------------------------
  // Scenario 15: Student without entitlement is blocked / locked
  // ---------------------------------------------------------------------------
  it("Scenario 15: Student without entitlement is blocked with locked access reason", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "بافت‌شناسی ۱",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    await officialContentService.setProductPricing(adminActor, course.id, { price: 300000 });
    await officialContentService.publishOfficialCourse(adminActor, course.id);

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: course.id,
      courseId: course.id,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
    expect(access.availablePurchaseOptions.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 16: Successful purchase creates lifetime entitlement
  // ---------------------------------------------------------------------------
  it("Scenario 16: Successful purchase creates lifetime entitlement", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "بافت‌شناسی ۲",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    const product = await officialContentService.setProductPricing(adminActor, course.id, { price: 300000 });
    await officialContentService.publishOfficialCourse(adminActor, course.id);

    // Checkout
    const checkout = await commerceService.checkout(
      studentActor,
      {
        productId: product.id as any,
        callbackUrl: "https://app.avana.ir/callback",
      },
      "req-buy-lifetime",
    );

    // Verify payment
    const verify = await commerceService.verifyPayment(
      {
        authority: checkout.authority,
        status: "OK",
      },
      "req-verify-lifetime",
    );

    expect(verify.success).toBe(true);
    expect(verify.entitlement?.resource_type).toBe("course");
    expect(verify.entitlement?.expires_at).toBeNull(); // Lifetime
  });

  // ---------------------------------------------------------------------------
  // Scenario 17: Student with entitlement can access the complete course
  // ---------------------------------------------------------------------------
  it("Scenario 17: Student with entitlement can access the complete course and lessons", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "بیولوژی دارویی",
    });
    const docId = await setupDocument(course.id);
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    await officialContentService.approveOfficialCourse(adminActor, course.id);
    const product = await officialContentService.setProductPricing(adminActor, course.id, { price: 390000 });
    await officialContentService.publishOfficialCourse(adminActor, course.id);

    // Buy
    const checkout = await commerceService.checkout(
      studentActor,
      {
        productId: product.id as any,
        callbackUrl: "https://app.avana.ir/callback",
      },
      "req-buy-17",
    );
    await commerceService.verifyPayment(
      { authority: checkout.authority, status: "OK" },
      "req-verify-17",
    );

    // Course access granted
    const courseAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: course.id,
      courseId: course.id,
    });
    expect(courseAccess.granted).toBe(true);
    expect(courseAccess.reason).toBe("course_purchase");

    // Course learning structure unlocked
    const learningData = await learningService.getCourseLearning(studentActor, course.id, "req-learn-17");
    expect(learningData.course.locked).toBe(false);
    expect(learningData.modules[0].lessons[0].locked).toBe(false);
    expect(learningData.modules[0].lessons[0].content_markdown).not.toContain("🔒");
  });

  // ---------------------------------------------------------------------------
  // Scenario 18: Full E2E Flow Succeeds
  // ---------------------------------------------------------------------------
  it("Scenario 18: Full E2E official content pipeline succeeds seamlessly", async () => {
    // 1. Create Official Course
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "شیمی دارویی جامع آوانا",
      subject: "شیمی دارویی",
      description: "دوره رسمی و تجاری برای آزمون جامع داروسازی",
    });
    expect(course.status).toBe("draft");

    // 2. Upload source doc
    const docId = await setupDocument(course.id);

    // 3. AI Generation
    const gen = await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);
    expect(gen.status).toBe("review");

    // 4. Review Workspace & Zero unresolved mappings
    const ws = await officialContentService.getReviewWorkspace(adminActor, course.id);
    expect(ws.unresolvedLessonMappings).toBe(0);
    expect(ws.readyForApproval).toBe(true);

    // 5. Approve & Invariant Materialization
    const approved = await officialContentService.approveOfficialCourse(adminActor, course.id);
    expect(approved.approved).toBe(true);

    // 6. Pricing
    const product = await officialContentService.setProductPricing(adminActor, course.id, {
      price: 590000,
    });
    expect(product.active).toBe(false);

    // 7. Consistency Validation
    const val = await officialContentService.validateConsistency(course.id);
    expect(val.valid).toBe(true);

    // 8. Publish
    const published = await officialContentService.publishOfficialCourse(adminActor, course.id);
    expect(published.course.status).toBe("published");
    expect(published.product.active).toBe(true);

    // 9. Student Access Check (Locked before purchase)
    const preAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: course.id,
      courseId: course.id,
    });
    expect(preAccess.granted).toBe(false);

    // 10. Student Purchase
    const chk = await commerceService.checkout(
      studentActor,
      { productId: product.id as any, callbackUrl: "https://app.avana.ir/callback" },
      "req-e2e-buy",
    );
    const ver = await commerceService.verifyPayment({ authority: chk.authority, status: "OK" }, "req-e2e-verify");
    expect(ver.success).toBe(true);

    // 11. Lifetime Access Unlocked
    const postAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: course.id,
      courseId: course.id,
    });
    expect(postAccess.granted).toBe(true);
    expect(postAccess.reason).toBe("course_purchase");
    expect(postAccess.expiresAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Scenario 19: Gemini 503 Service Unavailable throws service_unavailable DomainError
  // ---------------------------------------------------------------------------
  it("Scenario 19: Gemini 503 Service Unavailable throws service_unavailable (NOT rate_limit_exceeded)", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره تست خطای سرور ۵۰۳",
    });
    const docId = await setupDocument(course.id);

    const failingGeminiGateway = new GeminiModelGateway({
      apiKey: "fake-key",
      fetchFn: (async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: "The model is overloaded. Please try again later.",
              status: "UNAVAILABLE",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown as typeof fetch,
      sleepFn: () => Promise.resolve(),
    });

    const customGenService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      failingGeminiGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    const customOfficialContentService = new OfficialContentService(
      (adminStore as any).db,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      customGenService,
      reviewService,
      adminStore,
      officialOrgId,
    );

    await expect(
      customOfficialContentService.triggerOfficialGeneration(adminActor, course.id, docId),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DomainError);
      const domErr = err as DomainError;
      expect(domErr.code).toBe("service_unavailable");
      expect(domErr.code).not.toBe("rate_limit_exceeded");
      return true;
    });

    // Course status should roll back to draft
    const updated = await courseStore.findById(course.id);
    expect(updated?.status).toBe("draft");
  });

  // ---------------------------------------------------------------------------
  // Scenario 20: Gemini 429 Rate Limit throws rate_limit_exceeded DomainError
  // ---------------------------------------------------------------------------
  it("Scenario 20: Gemini 429 Rate Limit throws rate_limit_exceeded DomainError", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره تست خطای ریت لیمیت ۴۲۹",
    });
    const docId = await setupDocument(course.id);

    const failingGeminiGateway = new GeminiModelGateway({
      apiKey: "fake-key",
      fetchFn: (async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: "Rate limit exceeded. Try again in 30s.",
              status: "RESOURCE_EXHAUSTED",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown as typeof fetch,
      sleepFn: () => Promise.resolve(),
    });

    const customGenService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      failingGeminiGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    const customOfficialContentService = new OfficialContentService(
      (adminStore as any).db,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      customGenService,
      reviewService,
      adminStore,
      officialOrgId,
    );

    await expect(
      customOfficialContentService.triggerOfficialGeneration(adminActor, course.id, docId),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DomainError);
      const domErr = err as DomainError;
      expect(domErr.code).toBe("rate_limit_exceeded");
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 21: Official Content Pipeline — Product Identity & Price Preservation Across Regeneration
  // ---------------------------------------------------------------------------
  it("Scenario 21: Product Identity, Admin Price, and Entitlement Survive Regeneration in Official Content Pipeline", async () => {
    // 1. Create Course & Document
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "فارماکولوژی پیشرفته آوانا",
      subject: "فارماکولوژی",
    });
    const docId = await setupDocument(course.id);

    // 2. Generate Content
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId);

    // 3. Approve Course (Creates lesson products with volume-based suggested prices)
    const approved = await officialContentService.approveOfficialCourse(adminActor, course.id);
    expect(approved.approved).toBe(true);

    const modules = await moduleStore.listByCourse(course.id);
    const activeLessons = await lessonStore.listByModules(modules.filter((m) => !m.deletedAt).map((m) => m.id));
    const lesson1 = activeLessons.find((l) => !l.deletedAt)!;
    expect(lesson1).toBeDefined();

    // 4. Look up created lesson product
    const initialProduct = await commerceStore.findProductByCode(`content_${lesson1.id}`);
    expect(initialProduct).toBeDefined();
    const originalProductId = initialProduct!.id;

    // 5. Admin updates lesson product price to 10,000 and activates it
    const adminUpdate = await officialContentService.createOrUpdateLessonProduct(
      adminActor,
      lesson1.id,
      { price: 10000, active: true },
    );
    expect(adminUpdate.price).toBe(10000);
    expect(adminUpdate.active).toBe(true);

    // 6. Student purchases the direct Lesson Product
    const checkout = await commerceService.checkout(
      studentActor,
      { productId: originalProductId as any, callbackUrl: "https://app.avana.ir/cb" },
      "req-buy-lesson-e2e",
    );
    const verify = await commerceService.verifyPayment(
      { authority: checkout.authority, status: "OK" },
      "req-verify-lesson-e2e",
    );
    expect(verify.success).toBe(true);

    // 7. Verify Student has Access to Lesson 1
    const accessBefore = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lesson1.id,
      courseId: course.id,
    });
    expect(accessBefore.granted).toBe(true);
    expect(accessBefore.reason).toBe("content_purchase");

    // 8. Re-run Generation and Approval for the same Course / Document (Regeneration)
    await officialContentService.triggerOfficialGeneration(adminActor, course.id, docId, { force: true });
    const reApproved = await officialContentService.approveOfficialCourse(adminActor, course.id);
    expect(reApproved.approved).toBe(true);

    // 9. Fetch new active lesson
    const updatedModules = await moduleStore.listByCourse(course.id);
    const newActiveLessons = await lessonStore.listByModules(updatedModules.filter((m) => !m.deletedAt).map((m) => m.id));
    const lesson2 = newActiveLessons.find((l) => !l.deletedAt && l.id !== lesson1.id)!;
    expect(lesson2).toBeDefined();
    expect(lesson2.id).not.toBe(lesson1.id);

    // 10. Verify Product for Lesson 2:
    const postRegenProduct = await commerceStore.findProductByCode(`content_${lesson2.id}`);
    expect(postRegenProduct).toBeDefined();
    // A) Product ID is preserved:
    expect(postRegenProduct?.id).toBe(originalProductId);
    // B) Admin Price (10,000) is 100% PRESERVED:
    expect(postRegenProduct?.price).toBe(10000);
    // C) Active state is 100% PRESERVED:
    expect(postRegenProduct?.active).toBe(true);

    // 11. Verify Student Access to Regenerated Lesson 2:
    const accessAfter = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lesson2.id,
      courseId: course.id,
    });
    expect(accessAfter.granted).toBe(true);
    expect(accessAfter.reason).toBe("content_purchase");
  });
});
