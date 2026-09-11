import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  asCourseId,
  asDocumentId,
  asLessonId,
  asModuleId,
  asOrganizationId,
  asUserId,
  calculateDefaultContentPrice,
  calculateContentPricingBreakdown,
  CONTENT_PRICING_DEFAULTS,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
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
} from "../modules/generation/test/in-memory-stores.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { defaultPolicy } from "@avana/domain";

describe("Volume-Based Default Suggested Content Pricing & Protection Suite", () => {
  let commerceStore: InMemoryCommerceStore;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;

  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;

  const systemOrgId = asOrganizationId(randomUUID());

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "platform_admin",
  };

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
    if (sqlObj.conditions && Array.isArray(sqlObj.conditions)) {
      for (const c of sqlObj.conditions) {
        extractKeyValuePairs(c, result);
      }
    }
    if (sqlObj.column?.name && sqlObj.value !== undefined) {
      result[sqlObj.column.name] = sqlObj.value;
    }
    if (typeof sqlObj.value === "string") {
      result["value"] = sqlObj.value;
    }
    return result;
  };

  const findMatchingProducts = (condition: any) => {
    const all = commerceStore.products.filter((p) => !p.deletedAt);
    if (!condition) return all;
    const pairs = extractKeyValuePairs(condition);
    return all.filter((p) => {
      if (pairs.code && p.code !== pairs.code) return false;
      if (pairs.id && p.id !== pairs.id) return false;
      if ((pairs.target_id || pairs.targetId) && p.targetId !== (pairs.target_id || pairs.targetId)) return false;
      if ((pairs.target_type || pairs.targetType) && p.targetType !== (pairs.target_type || pairs.targetType)) return false;
      if (pairs.value && p.code !== pairs.value && p.id !== pairs.value && p.targetId !== pairs.value) return false;
      return true;
    });
  };

  const fakeDb: any = {
    select: () => ({
      from: (table: any) => ({
        where: (condition: any) => {
          const matched = findMatchingProducts(condition);
          return {
            limit: (n: number) => Promise.resolve(matched.slice(0, n)),
            then: (fn: any) => Promise.resolve(matched).then(fn),
          };
        },
        limit: (n: number) => Promise.resolve(commerceStore.products.slice(0, n)),
      }),
    }),
    insert: (table: any) => ({
      values: (val: any) => ({
        returning: async () => {
          const created = {
            id: val.id || randomUUID(),
            code: val.code,
            type: val.type,
            title: val.title,
            description: val.description || null,
            price: val.price,
            currency: val.currency || "toman",
            targetType: val.targetType || null,
            targetId: val.targetId || null,
            durationDays: val.durationDays || null,
            active: val.active !== undefined ? val.active : false,
            metadata: val.metadata || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          commerceStore.products.push(created);
          return [created];
        },
      }),
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: (condition: any) => ({
          returning: async () => {
            const matched = findMatchingProducts(condition);
            const existing = matched[0];
            if (existing) {
              Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
              return [existing];
            }
            return [];
          },
        }),
      }),
    }),
  };

  beforeEach(() => {
    commerceStore = new InMemoryCommerceStore();
    commerceService = new CommerceService(commerceStore, new MockPaymentGateway());
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      flashcardStore,
      quizStore,
    });

    reviewService = new ReviewService(
      generatedContentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      {} as any,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      undefined,
      commerceStore,
    );

    officialContentService = new OfficialContentService(
      fakeDb,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      {} as any,
      reviewService,
      {} as any,
      systemOrgId,
    );
  });

  it("calculates default suggested price of 4,900 for 150 FC, 220 Questions, and Review Summary", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());

    // 1. Create document & course
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "فارماکولوژی قلب و عروق",
      sourceType: "pdf",
      storageKey: "doc.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10000,
      status: "extracted",
      tokenEstimate: 5000,
      chunkCount: 10,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره فارماکولوژی",
        status: "generating",
        isOfficial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Add 150 flashcards draft
    const flashcardsArray = Array.from({ length: 150 }, (_, i) => ({
      question: `فلش‌کارت ${i + 1}`,
      answer: `پاسخ ${i + 1}`,
    }));
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: { kind: "flashcard", cards: flashcardsArray, citationChunkIds: [] },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 3. Add 220 questions draft
    const questionsArray = Array.from({ length: 220 }, (_, i) => ({
      question: `سوال تستی ${i + 1}`,
      questionType: "multiple_choice" as const,
      choices: ["الف", "ب", "ج", "د"],
      correctAnswer: 0,
    }));
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: { kind: "quiz", title: "آزمون فارماکولوژی", questions: questionsArray, citationChunkIds: [] },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 4. Add Review Summary draft
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "خلاصه مروری فارماکولوژی",
        estimatedReadingMinutes: 10,
        overview: "خلاصه جامع نکات پرتکرار",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته کلیدی ۱"],
          },
        ],
        finalTakeaways: ["جمع‌بندی نهایی"],
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 5. Add Lesson draft and materialize via ReviewService.acceptContent
    const lessonDraftId = randomUUID() as any;
    await generatedContentStore.create({
      id: lessonDraftId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فارماکولوژی داروهای قلب",
        contentMarkdown: "# محتوای درس",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const acceptResult = await reviewService.acceptContent(
      adminActor,
      systemOrgId,
      lessonDraftId,
    );

    expect(acceptResult.materialized_lesson_id).toBeDefined();
    const materializedLessonId = acceptResult.materialized_lesson_id!;

    // 6. Verify Content Product was created with calculated suggested price: 4,900 and active: false
    const product = await commerceStore.findProductByCode(`content_${materializedLessonId}`);
    expect(product).toBeDefined();
    expect(product?.price).toBe(4900);
    expect(product?.active).toBe(false);
    expect(product?.type).toBe("content");
    expect(product?.targetType).toBe("content");
    expect(product?.targetId).toBe(materializedLessonId);

    // 7. Admin updates price to 10,000
    await commerceStore.updateProduct(product!.id, {
      price: 10000,
      active: true,
      metadata: { ...product!.metadata, adminPriced: true },
    });

    const updatedProduct = await commerceStore.findProductById(product!.id);
    expect(updatedProduct?.price).toBe(10000);
    expect(updatedProduct?.active).toBe(true);

    // 8. Regeneration is performed (materializing replacement lesson for same document)
    const regenLessonDraftId = randomUUID() as any;
    await generatedContentStore.create({
      id: regenLessonDraftId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فارماکولوژی داروهای قلب (بازنویسی‌شده)",
        contentMarkdown: "# محتوای درس به‌روزشده",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const regenResult = await reviewService.acceptContent(
      adminActor,
      systemOrgId,
      regenLessonDraftId,
    );

    const regenLessonId = regenResult.materialized_lesson_id!;
    const postRegenProduct = await commerceStore.findProductByCode(`content_${regenLessonId}`);

    // Absolute Guarantee: Admin selling price (10,000) is PRESERVED!
    expect(postRegenProduct).toBeDefined();
    expect(postRegenProduct?.price).toBe(10000);
    expect(postRegenProduct?.active).toBe(true);
  });

  // Critical Guardrail 9 Test
  it("Scenario 9: Adding 100 FC + 100 Q + Summary edit + Regeneration PRESERVES Admin price of 10,000", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());

    // 1. Setup initial draft items
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "بیوشیمی پزشکی",
      sourceType: "pdf",
      storageKey: "bio.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10000,
      status: "extracted",
      tokenEstimate: 5000,
      chunkCount: 10,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const initialLessonDraftId = randomUUID() as any;
    await generatedContentStore.create({
      id: initialLessonDraftId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "مسیرهای متابولیک",
        contentMarkdown: "# مسیرهای متابولیک",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Accept initial lesson
    const res1 = await reviewService.acceptContent(adminActor, systemOrgId, initialLessonDraftId);
    const lesson1Id = res1.materialized_lesson_id!;

    // Initial product has suggested price = 1000
    const initialProduct = await commerceStore.findProductByCode(`content_${lesson1Id}`);
    expect(initialProduct).toBeDefined();

    // Admin configures price to 10,000
    await commerceStore.updateProduct(initialProduct!.id, {
      price: 10000,
      active: true,
      metadata: { adminPriced: true },
    });

    // Now add 100 flashcards, 100 questions, and complete summary
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: Array.from({ length: 100 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` })),
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "کوییز متابولیسم",
        questions: Array.from({ length: 100 }, (_, i) => ({
          question: `سوال ${i}`,
          questionType: "multiple_choice" as const,
          choices: ["1", "2", "3", "4"],
          correctAnswer: 0,
        })),
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "خلاصه جدید",
        overview: "توضیحات جدید",
        sections: [{ title: "S1", keyPoints: ["P1"] }],
        finalTakeaways: ["T1"],
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Perform regeneration
    const regenDraftId = randomUUID() as any;
    await generatedContentStore.create({
      id: regenDraftId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "مسیرهای متابولیک (ویرایش ۲)",
        contentMarkdown: "# ویرایش جدید",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res2 = await reviewService.acceptContent(adminActor, systemOrgId, regenDraftId);
    const lesson2Id = res2.materialized_lesson_id!;

    const finalProduct = await commerceStore.findProductByCode(`content_${lesson2Id}`);
    expect(finalProduct).toBeDefined();
    // Guardrail 9 requirement: Product.price MUST still be 10000!
    expect(finalProduct?.price).toBe(10000);
    expect(finalProduct?.active).toBe(true);
  });

  // Guardrail 6: Incomplete Review Summary Test
  it("does not add 2,000 Tomans for incomplete review summary", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "فیزیولوژی",
      sourceType: "pdf",
      storageKey: "phys.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 5000,
      status: "extracted",
      tokenEstimate: 2000,
      chunkCount: 5,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Incomplete review summary (empty overview, no sections)
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "Incomplete",
        overview: "",
        sections: [],
        finalTakeaways: [],
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lessonDraftId = randomUUID() as any;
    await generatedContentStore.create({
      id: lessonDraftId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فیزیولوژی سلولی",
        contentMarkdown: "# سلول",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await reviewService.acceptContent(adminActor, systemOrgId, lessonDraftId);
    const lessonId = res.materialized_lesson_id!;

    const product = await commerceStore.findProductByCode(`content_${lessonId}`);
    expect(product).toBeDefined();
    // 1000 base only because summary was incomplete (0 FC, 0 Q, incomplete summary)
    expect(product?.price).toBe(1000);
    expect(product?.active).toBe(false);
  });

  // Guardrail 7: Legacy Content Protection Test
  it("preserves legacy backfilled products without mutation", async () => {
    const legacyLessonId = asLessonId(randomUUID());
    const legacyProductCode = `content_${legacyLessonId}`;

    // Simulate backfilled legacy product (price = 0, active = false)
    await commerceStore.createProduct({
      id: randomUUID() as any,
      code: legacyProductCode,
      type: "content",
      title: "درس قدیمی بک‌فیل‌شده",
      description: "درس قدیمی",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: legacyLessonId,
      durationDays: null,
      active: false,
      metadata: { legacyBackfilled: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const existing = await commerceStore.findProductByCode(legacyProductCode);
    expect(existing).toBeDefined();
    expect(existing?.price).toBe(0);
    expect(existing?.active).toBe(false);

    // Calculate suggested price preview without modifying the database
    const previewBreakdown = calculateContentPricingBreakdown({
      lessonCount: 1,
      flashcardCount: 50,
      questionCount: 30,
      hasReviewSummary: true,
    });

    expect(previewBreakdown.totalSuggestedPrice).toBe(3800);

    // Verify original legacy product is untouched in store
    const afterCheck = await commerceStore.findProductByCode(legacyProductCode);
    expect(afterCheck?.price).toBe(0);
    expect(afterCheck?.active).toBe(false);
  });

  it("OfficialContentService.ensureLessonProduct creates suggested product for new lesson and preserves existing", async () => {
    const lessonId = asLessonId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول قلب",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس آریتمی",
      contentType: "markdown",
      contentMarkdown: "# آریتمی",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 1. ensureLessonProduct creates product with 1000 base when no FC/Q/Summary exist
    const res1 = await officialContentService.ensureLessonProduct(lessonId);
    expect(res1.isNew).toBe(true);
    expect(res1.price).toBe(1000);
    expect(res1.active).toBe(false);

    // 2. Calling ensureLessonProduct again preserves the product
    const res2 = await officialContentService.ensureLessonProduct(lessonId);
    expect(res2.isNew).toBe(false);
    expect(res2.price).toBe(1000);

    // 3. Admin modifies price via createOrUpdateLessonProduct
    const adminUpdate = await officialContentService.createOrUpdateLessonProduct(
      adminActor,
      lessonId,
      { price: 15000, active: true },
    );
    expect(adminUpdate.price).toBe(15000);
    expect(adminUpdate.active).toBe(true);

    // 4. Calling ensureLessonProduct again maintains 15000 price
    const res3 = await officialContentService.ensureLessonProduct(lessonId);
    expect(res3.price).toBe(15000);
    expect(res3.active).toBe(true);
    expect(res3.isNew).toBe(false);
  });

  it("OfficialContentService.getSuggestedPriceForLesson returns breakdown and current product", async () => {
    const lessonId = asLessonId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول جراحی",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس آپاندیسیت",
      contentType: "markdown",
      contentMarkdown: "# آپاندیسیت",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const suggestion = await officialContentService.getSuggestedPriceForLesson(adminActor, lessonId);
    expect(suggestion.lessonBasePrice).toBe(1000);
    expect(suggestion.totalSuggestedPrice).toBe(1000);
    expect(suggestion.currentProduct).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Dedicated Invariant Test: Product Identity (ID & Price) Survives Regeneration
  // ---------------------------------------------------------------------------
  it("proves product identity (ID) and selling price survive regeneration with zero duplicate products created", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());

    // 1. Create document & course
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "نورولوژی و علوم اعصاب",
      sourceType: "pdf",
      storageKey: "neuro.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10000,
      status: "extracted",
      tokenEstimate: 5000,
      chunkCount: 10,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Draft & Materialize initial lesson
    const draft1Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft1Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "نورون‌ها و سیناپس‌ها",
        contentMarkdown: "# نورون‌ها",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res1 = await reviewService.acceptContent(adminActor, systemOrgId, draft1Id);
    const lesson1Id = res1.materialized_lesson_id!;

    // 3. Get initial Product
    const initialProduct = await commerceStore.findProductByCode(`content_${lesson1Id}`);
    expect(initialProduct).toBeDefined();
    const originalProductId = initialProduct!.id;
    const initialProductCount = commerceStore.products.filter((p) => !p.deletedAt && p.type === "content").length;

    // 4. Admin customizes price to 10,000 and sets active = true
    await commerceStore.updateProduct(originalProductId, {
      price: 10000,
      active: true,
      metadata: { adminPriced: true, customizedAt: new Date().toISOString() },
    });

    const configuredProduct = await commerceStore.findProductById(originalProductId);
    expect(configuredProduct?.price).toBe(10000);
    expect(configuredProduct?.active).toBe(true);

    // 5. Regenerate the SAME logical content (Document)
    const draft2Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft2Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "نورون‌ها و سیناپس‌ها (بازنویسی نسل دوم)",
        contentMarkdown: "# نورون‌ها به‌روزشده",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res2 = await reviewService.acceptContent(adminActor, systemOrgId, draft2Id);
    const lesson2Id = res2.materialized_lesson_id!;
    expect(lesson2Id).not.toBe(lesson1Id); // Proves a new lessonId was generated

    // 6. Look up product for the new lessonId
    const postRegenProduct = await commerceStore.findProductByCode(`content_${lesson2Id}`);
    expect(postRegenProduct).toBeDefined();

    // PROOF OF INVARIANTS:
    // A) Product identity (ID) is the EXACT SAME UUID:
    expect(postRegenProduct?.id).toBe(originalProductId);
    // B) Admin selling price (10,000) is 100% PRESERVED:
    expect(postRegenProduct?.price).toBe(10000);
    // C) Admin active status (true) is 100% PRESERVED:
    expect(postRegenProduct?.active).toBe(true);
    // D) Target ID and Code track the new Lesson:
    expect(postRegenProduct?.targetId).toBe(lesson2Id);
    expect(postRegenProduct?.code).toBe(`content_${lesson2Id}`);
    // E) Zero orphan / duplicate products created:
    const activeProducts = commerceStore.products.filter((p) => !p.deletedAt && p.type === "content");
    expect(activeProducts.length).toBe(initialProductCount);
  });

  // ---------------------------------------------------------------------------
  // Dedicated Invariant Test: Student Entitlement & Access Survive Regeneration
  // ---------------------------------------------------------------------------
  it("proves student access and lifetime entitlement survive regeneration of the same logical content", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());
    const studentActor: Actor = {
      userId: asUserId(randomUUID()),
      role: "student",
    };

    // 1. Setup Document & Course
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "ژنتیک پزشکی",
      sourceType: "pdf",
      storageKey: "gen.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10000,
      status: "extracted",
      tokenEstimate: 5000,
      chunkCount: 10,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Draft & Materialize Lesson 1
    const draft1Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft1Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "الگوهای وراثت مندلی",
        contentMarkdown: "# وراثت مندلی",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res1 = await reviewService.acceptContent(adminActor, systemOrgId, draft1Id);
    const lesson1Id = res1.materialized_lesson_id!;

    // 3. Set Product price & activate
    const product = await commerceStore.findProductByCode(`content_${lesson1Id}`);
    await commerceStore.updateProduct(product!.id, {
      price: 8000,
      active: true,
    });

    // 4. Student Purchases Product via Card-to-Card
    const c2cRes = await commerceService.submitCardToCardPayment(
      studentActor,
      {
        productId: product!.id,
        amount: 8000,
        trackingNumber: "TRK-PRICE-SUGG-1",
        sourceCardLast4: "1234",
      },
      "req-buy-lesson1",
    );
    expect(c2cRes.success).toBe(true);

    // 5. Verify Student has Access to Lesson 1
    const accessBefore = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lesson1Id,
      courseId,
    });
    expect(accessBefore.granted).toBe(true);
    expect(accessBefore.reason).toBe("content_purchase");

    // 6. Content is Regenerated (Creating Lesson 2, soft-deleting Lesson 1)
    const draft2Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft2Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "الگوهای وراثت مندلی (نسخه ارتقایافته)",
        contentMarkdown: "# وراثت مندلی نسخه جدید",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res2 = await reviewService.acceptContent(adminActor, systemOrgId, draft2Id);
    const lesson2Id = res2.materialized_lesson_id!;

    // 7. Verify Student Still has Access to Regenerated Lesson 2 without Re-purchasing!
    const accessAfter = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lesson2Id,
      courseId,
    });
    expect(accessAfter.granted).toBe(true);
    expect(accessAfter.reason).toBe("content_purchase");
  });

  // ---------------------------------------------------------------------------
  // Dedicated Test: Substantial Volume Expansion vs Admin Price Preservation
  // ---------------------------------------------------------------------------
  it("proves price preservation when volume substantially expands after admin custom pricing", async () => {
    const documentId = asDocumentId(randomUUID());
    const courseId = asCourseId(randomUUID());

    // 1. Initial Document with 150 FC, 220 Q, Summary -> Suggested Price = 4,900
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      title: "ایمونولوژی پایه",
      sourceType: "pdf",
      storageKey: "immuno.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10000,
      status: "extracted",
      tokenEstimate: 5000,
      chunkCount: 10,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: Array.from({ length: 150 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` })),
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        questions: Array.from({ length: 220 }, (_, i) => ({
          question: `Q${i}`,
          questionType: "multiple_choice" as const,
          choices: ["1", "2", "3", "4"],
          correctAnswer: 0,
        })),
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "خلاصه ایمونولوژی",
        overview: "Overview",
        sections: [{ title: "S1", keyPoints: ["P1"] }],
        finalTakeaways: [],
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const draft1Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft1Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "سیستم کمپلمان",
        contentMarkdown: "# کمپلمان",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res1 = await reviewService.acceptContent(adminActor, systemOrgId, draft1Id);
    const lesson1Id = res1.materialized_lesson_id!;

    // Initial suggested price = 4,900
    const prod1 = await commerceStore.findProductByCode(`content_${lesson1Id}`);
    expect(prod1?.price).toBe(4900);

    // 2. Admin explicitly changes price to 10,000
    await commerceStore.updateProduct(prod1!.id, {
      price: 10000,
      active: true,
      metadata: { adminPriced: true },
    });

    // 3. Substantial volume increase: +200 flashcards, +100 questions
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: Array.from({ length: 200 }, (_, i) => ({ question: `ExtraQ${i}`, answer: `ExtraA${i}` })),
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 4. Regeneration occurs
    const draft2Id = randomUUID() as any;
    await generatedContentStore.create({
      id: draft2Id,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "سیستم کمپلمان (ویرایش گسترده)",
        contentMarkdown: "# کمپلمان گسترده",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock",
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res2 = await reviewService.acceptContent(adminActor, systemOrgId, draft2Id);
    const lesson2Id = res2.materialized_lesson_id!;

    // 5. Verify the preview suggested price for this lesson is now higher (e.g. 5,900)
    const preview = await officialContentService.getSuggestedPriceForLesson(adminActor, lesson2Id);
    expect(preview.totalSuggestedPrice).toBeGreaterThan(4900);

    // 6. BUT SELLING PRICE IN DATABASE REMAINS EXACTLY 10,000!
    const finalProduct = await commerceStore.findProductByCode(`content_${lesson2Id}`);
    expect(finalProduct?.price).toBe(10000);
    expect(finalProduct?.active).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Dedicated Test: Preview Suggestion Endpoint NEVER Mutates Product
  // ---------------------------------------------------------------------------
  it("proves pricing suggestion endpoint is strictly a read-only preview and NEVER mutates the database product", async () => {
    const lessonId = asLessonId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول تست رید-اونلی",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس ایمن",
      contentType: "markdown",
      contentMarkdown: "# محتوا",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create an existing product with customized price
    const prod = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `content_${lessonId}`,
      type: "content",
      title: "درس ایمن",
      description: "توضیح",
      price: 25000,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: { adminCustom: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });

    // Call suggestion endpoint multiple times
    const suggestion1 = await officialContentService.getSuggestedPriceForLesson(adminActor, lessonId);
    const suggestion2 = await officialContentService.getSuggestedPriceForLesson(adminActor, lessonId);

    expect(suggestion1.totalSuggestedPrice).toBe(1000);
    expect(suggestion2.totalSuggestedPrice).toBe(1000);
    expect(suggestion1.currentProduct?.price).toBe(25000);

    // Verify product in database was NOT modified at all
    const afterProduct = await commerceStore.findProductById(prod.id);
    expect(afterProduct?.price).toBe(25000);
    expect(afterProduct?.active).toBe(true);
    expect(afterProduct?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  // ---------------------------------------------------------------------------
  // Dedicated Test: Genuinely New Content Pricing with Metadata Breakdown
  // ---------------------------------------------------------------------------
  it("proves genuinely new content with no prior identity gets suggested price, active=false, and breakdown metadata", async () => {
    const lessonId = asLessonId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول جدید",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس کاملاً جدید",
      contentType: "markdown",
      contentMarkdown: "# جدید",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create 50 flashcards and 30 questions for this course
    await flashcardStore.createMany([
      {
        id: randomUUID() as any,
        courseId,
        organizationId: systemOrgId,
        lessonId,
        documentId: null,
        front: "F1",
        back: "B1",
        sortOrder: 0,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 0,
        dueAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    ]);

    const createdProduct = await officialContentService.ensureLessonProduct(lessonId);
    expect(createdProduct.isNew).toBe(true);
    expect(createdProduct.active).toBe(false);
    expect(createdProduct.currency).toBe("toman");
    // 1000 base + 500 (1-100 flashcards) = 1500
    expect(createdProduct.price).toBe(1500);

    const dbProd = await commerceStore.findProductByCode(`content_${lessonId}`);
    expect(dbProd?.metadata?.defaultPriced).toBe(true);
    expect(dbProd?.metadata?.suggestedPrice).toBe(1500);
    expect(dbProd?.metadata?.pricingBreakdown).toBeDefined();
    expect((dbProd?.metadata?.pricingBreakdown as any).flashcardPrice).toBe(500);
    expect((dbProd?.metadata?.pricingBreakdown as any).lessonBasePrice).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // Dedicated Security Test: Content Lineage vs Module-wide Non-Leakage
  // ---------------------------------------------------------------------------
  it("strictly enforces that purchasing Lesson A grants regenerated Lesson A' but NEVER grants unrelated Lesson B in the same module", async () => {
    const courseId = asCourseId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const lessonA_id = asLessonId(randomUUID());
    const lessonB_id = asLessonId(randomUUID());

    // 1. Create Course & Module M
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        title: "جامع قلب و عروق",
        description: null,
        status: "published",
        isOfficial: true,
        authorUserId: adminActor.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول فیزیولوژی",
      sortOrder: 1, // Non-zero to avoid free intro preview fallback
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Create Lesson A and Lesson B in Module M
    await lessonStore.create({
      id: lessonA_id,
      moduleId,
      title: "درس الف: الکتروفیزیولوژی",
      contentType: "markdown",
      contentMarkdown: "# درس الف",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonB_id,
      moduleId,
      title: "درس ب: مکانیک بطنی",
      contentType: "markdown",
      contentMarkdown: "# درس ب",
      sortOrder: 1,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create Products for Lesson A and Lesson B
    const prodA = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `content_${lessonA_id}`,
      type: "content",
      title: "محصول درس الف",
      description: null,
      price: 10000,
      currency: "toman",
      targetType: "content",
      targetId: lessonA_id,
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const prodB = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `content_${lessonB_id}`,
      type: "content",
      title: "محصول درس ب",
      description: null,
      price: 12000,
      currency: "toman",
      targetType: "content",
      targetId: lessonB_id,
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 3. User 1 purchases ONLY Lesson A
    const user1 = asUserId(randomUUID());
    const order1 = await commerceStore.createOrder({
      id: randomUUID() as any,
      orderNumber: "ORD-USER1-A",
      userId: user1,
      productId: prodA.id,
      amount: 10000,
      currency: "toman",
      status: "completed",
      paymentMethod: "mock",
      paidAt: new Date().toISOString(),
      gateway: "mock",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: user1,
      resourceType: "content",
      resourceId: lessonA_id,
      sourceType: "purchase",
      orderId: order1.id,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 4. User 2 has NO entitlements
    const user2 = asUserId(randomUUID());

    // 5. User 3 has Course entitlement
    const user3 = asUserId(randomUUID());
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: user3,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "purchase",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 6. Regenerate Lesson A -> Lesson A'
    const docA_id = asDocumentId(randomUUID());
    await documentStore.create({
      id: docA_id,
      organizationId: systemOrgId,
      courseId,
      title: "سند درس الف",
      sourceType: "pdf",
      storageKey: "docA.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1000,
      status: "extracted",
      tokenEstimate: 1000,
      chunkCount: 1,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Prior draft that materialized Lesson A
    const priorDraftA = await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId: docA_id,
      courseId,
      type: "lesson",
      status: "accepted",
      payload: { title: "درس الف: الکتروفیزیولوژی" },
      promptVersion: "1.0",
      model: "gpt-4o",
      materializedLessonId: lessonA_id,
      reviewedBy: adminActor.userId,
      reviewedAt: new Date().toISOString(),
      reviewReason: null,
      acceptedBy: adminActor.userId,
      acceptedAt: new Date().toISOString(),
      editedBy: null,
      editedAt: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // New draft for regeneration of Lesson A
    const regenDraftA = await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId: docA_id,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        title: "درس الف: الکتروفیزیولوژی پیشرفته (نسخه ۲)",
        moduleTitle: "ماژول فیزیولوژی",
        sessions: [
          {
            title: "درس الف: الکتروفیزیولوژی پیشرفته (نسخه ۲)",
            contentMarkdown: "# درس الف ویرایش جدید",
          },
        ],
      },
      promptVersion: "1.0",
      model: "gpt-4o",
      materializedLessonId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      editedBy: null,
      editedAt: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const acceptResult = await reviewService.acceptContent(adminActor, systemOrgId, regenDraftA.id);
    const lessonA_prime_id = acceptResult.materialized_lesson_id!;
    expect(lessonA_prime_id).not.toBe(lessonA_id);

    // 7. Security Assertions:
    // User 1 (Bought A):
    // Access to A' -> GRANTED
    const user1AccessA_prime = await entitlementService.checkAccess(
      { userId: user1, role: "student" },
      { resourceType: "lesson", resourceId: lessonA_prime_id },
    );
    expect(user1AccessA_prime.granted).toBe(true);
    expect(user1AccessA_prime.reason).toBe("content_purchase");

    // Access to unrelated Lesson B -> DENIED!
    const user1AccessB = await entitlementService.checkAccess(
      { userId: user1, role: "student" },
      { resourceType: "lesson", resourceId: lessonB_id },
    );
    expect(user1AccessB.granted).toBe(false);
    expect(user1AccessB.reason).toBe("locked");

    // User 2 (No purchase):
    // Access to A' -> DENIED
    const user2AccessA_prime = await entitlementService.checkAccess(
      { userId: user2, role: "student" },
      { resourceType: "lesson", resourceId: lessonA_prime_id },
    );
    expect(user2AccessA_prime.granted).toBe(false);
    expect(user2AccessA_prime.reason).toBe("locked");

    // Access to B -> DENIED
    const user2AccessB = await entitlementService.checkAccess(
      { userId: user2, role: "student" },
      { resourceType: "lesson", resourceId: lessonB_id },
    );
    expect(user2AccessB.granted).toBe(false);
    expect(user2AccessB.reason).toBe("locked");

    // User 3 (Course purchase):
    // Access to A' -> GRANTED via course_purchase
    const user3AccessA_prime = await entitlementService.checkAccess(
      { userId: user3, role: "student" },
      { resourceType: "lesson", resourceId: lessonA_prime_id },
    );
    expect(user3AccessA_prime.granted).toBe(true);
    expect(user3AccessA_prime.reason).toBe("course_purchase");

    // Access to B -> GRANTED via course_purchase
    const user3AccessB = await entitlementService.checkAccess(
      { userId: user3, role: "student" },
      { resourceType: "lesson", resourceId: lessonB_id },
    );
    expect(user3AccessB.granted).toBe(true);
    expect(user3AccessB.reason).toBe("course_purchase");
  });

  // ---------------------------------------------------------------------------
  // Dedicated Test: Multi-Step Regeneration Chain (A -> A' -> A'')
  // ---------------------------------------------------------------------------
  it("maintains entitlement chain across multi-step regenerations (A -> A' -> A'') without leaking to other lessons", async () => {
    const courseId = asCourseId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const lessonA_id = asLessonId(randomUUID());
    const lessonB_id = asLessonId(randomUUID());

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        title: "فیزیولوژی قلب",
        description: null,
        status: "published",
        isOfficial: true,
        authorUserId: adminActor.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "ماژول ۲",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonA_id,
      moduleId,
      title: "نسخه اولیه درس الف",
      contentType: "markdown",
      contentMarkdown: "# نسخه ۱",
      sortOrder: 0,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonB_id,
      moduleId,
      title: "درس مجزای ب",
      contentType: "markdown",
      contentMarkdown: "# درس ب",
      sortOrder: 1,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const prodA = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `content_${lessonA_id}`,
      type: "content",
      title: "محصول درس الف",
      description: null,
      price: 15000,
      currency: "toman",
      targetType: "content",
      targetId: lessonA_id,
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const user1 = asUserId(randomUUID());
    const order1 = await commerceStore.createOrder({
      id: randomUUID() as any,
      orderNumber: "ORD-U1-A-MULTI",
      userId: user1,
      productId: prodA.id,
      amount: 15000,
      currency: "toman",
      status: "completed",
      paymentMethod: "mock",
      paidAt: new Date().toISOString(),
      gateway: "mock",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: user1,
      resourceType: "content",
      resourceId: lessonA_id,
      sourceType: "purchase",
      orderId: order1.id,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const docId = asDocumentId(randomUUID());
    await documentStore.create({
      id: docId,
      organizationId: systemOrgId,
      courseId,
      title: "سند الف",
      sourceType: "pdf",
      storageKey: "docA.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1000,
      status: "extracted",
      tokenEstimate: 1000,
      chunkCount: 1,
      qualityScore: 90,
      extractedAt: new Date().toISOString(),
      ownerUserId: adminActor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "accepted",
      payload: { title: "نسخه اولیه درس الف" },
      promptVersion: "1.0",
      model: "gpt-4o",
      materializedLessonId: lessonA_id,
      reviewedBy: adminActor.userId,
      reviewedAt: new Date().toISOString(),
      reviewReason: null,
      acceptedBy: adminActor.userId,
      acceptedAt: new Date().toISOString(),
      editedBy: null,
      editedAt: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // First Regeneration: A -> A'
    const draftA_prime = await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        title: "نسخه دوم درس الف",
        moduleTitle: "ماژول ۲",
        sessions: [{ title: "نسخه دوم درس الف", contentMarkdown: "# نسخه ۲" }],
      },
      promptVersion: "1.0",
      model: "gpt-4o",
      materializedLessonId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      editedBy: null,
      editedAt: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    const res1 = await reviewService.acceptContent(adminActor, systemOrgId, draftA_prime.id);
    const lessonA_prime_id = res1.materialized_lesson_id!;

    // Second Regeneration: A' -> A''
    const draftA_double_prime = await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        title: "نسخه سوم نهایی درس الف",
        moduleTitle: "ماژول ۲",
        sessions: [{ title: "نسخه سوم نهایی درس الف", contentMarkdown: "# نسخه ۳" }],
      },
      promptVersion: "1.0",
      model: "gpt-4o",
      materializedLessonId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      editedBy: null,
      editedAt: null,
      tokenUsage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    const res2 = await reviewService.acceptContent(adminActor, systemOrgId, draftA_double_prime.id);
    const lessonA_double_prime_id = res2.materialized_lesson_id!;

    // Verify User 1 access to A'' (multi-step successor) -> GRANTED!
    const accessA_double_prime = await entitlementService.checkAccess(
      { userId: user1, role: "student" },
      { resourceType: "lesson", resourceId: lessonA_double_prime_id },
    );
    expect(accessA_double_prime.granted).toBe(true);
    expect(accessA_double_prime.reason).toBe("content_purchase");

    // Verify User 1 access to unrelated Lesson B -> DENIED!
    const accessB = await entitlementService.checkAccess(
      { userId: user1, role: "student" },
      { resourceType: "lesson", resourceId: lessonB_id },
    );
    expect(accessB.granted).toBe(false);
    expect(accessB.reason).toBe("locked");

    // Verify adding a completely new Lesson C to Module M is also DENIED to User 1
    const lessonC_id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonC_id,
      moduleId,
      title: "درس جدید ج",
      contentType: "markdown",
      contentMarkdown: "# درس ج",
      sortOrder: 2,
      estimatedMinutes: null,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const accessC = await entitlementService.checkAccess(
      { userId: user1, role: "student" },
      { resourceType: "lesson", resourceId: lessonC_id },
    );
    expect(accessC.granted).toBe(false);
    expect(accessC.reason).toBe("locked");
  });
});
