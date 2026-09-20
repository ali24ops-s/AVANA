import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryCommerceStore,
  MockPaymentGateway,
  EntitlementService,
} from "../modules/commerce/index.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  asCourseId,
  asModuleId,
  asProductId,
  type CourseId,
  type ModuleId,
  type DocumentId,
  type OrganizationId,
  type UserId,
  asDocumentId,
} from "@avana/domain";
import type { StorageProvider } from "../modules/storage/storage-provider.js";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async put(key: string, data: Buffer | Uint8Array, _contentType?: string): Promise<void> {
    this.files.set(key, Buffer.from(data));
  }

  async get(key: string): Promise<Buffer> {
    const data = this.files.get(key);
    if (!data) throw new Error(`Not found: ${key}`);
    return data;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    return `https://storage.example.com/${key}`;
  }
}

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Review Summary Preview Access Control", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let queue: InMemoryGenerationQueue;
  let storageProvider: FakeStorageProvider;
  let commerceStore: InMemoryCommerceStore;
  let paymentGateway: MockPaymentGateway;
  let entitlementService: EntitlementService;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let auditService: AuditService;

  let phoneCounter = 500000;
  async function registerUser(app: any, email: string, name = "کاربر آزمایشی") {
    phoneCounter++;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Password123!",
        name,
        phoneNumber: `0912${String(phoneCounter).padStart(7, "0")}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const sessionToken = extractSessionToken(res)!;
    const body = JSON.parse(res.body);
    return {
      sessionToken,
      userId: body.user.id as UserId,
      cookies: { avana_session: sessionToken },
    };
  }

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(orgStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    storageProvider = new FakeStorageProvider();
    commerceStore = new InMemoryCommerceStore();
    paymentGateway = new MockPaymentGateway();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore();
    auditService = new AuditService(new InMemoryAuditStore());
    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      flashcardStore,
      quizStore,
    });
  });

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      gateway: createModelGateway("mock"),
      commerceStore,
      paymentGateway,
      entitlementService,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
    });
    await app.ready();
    return app;
  }

  async function seedCourse(course: {
    id: CourseId;
    organizationId?: OrganizationId;
    name: string;
    description?: string;
    subject?: string;
    publicationStatus?: string;
    createdBy?: string;
  }) {
    const orgId = course.organizationId ?? (config.systemOrganizationId as OrganizationId);
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: course.id,
        organizationId: orgId,
        name: course.name,
        description: course.description ?? "شرح دوره",
        subject: course.subject ?? "پزشکی",
        examDate: null,
        isArchived: false,
        publicationStatus: (course.publicationStatus as any) ?? "published",
        createdBy: (course.createdBy as any) ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    return orgId;
  }

  async function seedPaidProduct(courseId: CourseId, price = 150000) {
    const now = new Date().toISOString();
    return commerceStore.createProduct({
      id: asProductId(randomUUID()),
      type: "course",
      title: "دسترسی کامل به دوره",
      code: `COURSE-${courseId}`,
      description: "دسترسی کامل",
      price,
      currency: "IRT",
      targetType: "course",
      targetId: courseId,
      active: true,
      durationDays: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);
  }

  async function seedDocumentAndModule(params: {
    courseId: CourseId;
    organizationId: OrganizationId;
    moduleId: ModuleId;
    documentId: DocumentId;
    title: string;
    sortOrder: number;
    summaryContent?: string;
  }) {
    const now = new Date().toISOString();
    // 1. Create Document
    await documentStore.create({
      id: params.documentId,
      organizationId: params.organizationId,
      courseId: params.courseId,
      title: params.title,
      fileName: `${params.title}.pdf`,
      fileSize: 1024,
      fileType: "application/pdf",
      storageKey: `docs/${params.documentId}.pdf`,
      contentStatus: "ready",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Create Module linking to Document
    await moduleStore.create({
      id: params.moduleId,
      courseId: params.courseId,
      title: params.title,
      description: `توضیحات ${params.title}`,
      sortOrder: params.sortOrder,
      documentId: params.documentId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. If summary content provided, seed generated content
    if (params.summaryContent) {
      await generatedContentStore.create({
        id: randomUUID() as any,
        organizationId: params.organizationId,
        courseId: params.courseId,
        documentId: params.documentId,
        type: "review_summary",
        status: "accepted",
        payload: {
          text: params.summaryContent,
          keyTakeaways: ["نکته ۱", "نکته ۲"],
          sections: [
            { heading: "بخش ۱", summary: "خلاصه بخش ۱" },
          ],
        } as any,
        promptVersion: "1.0",
        model: "mock",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: now,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
  }

  it("Course Learn endpoint returns canonical preview_document_id", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-summary-1@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "دوره فیزیولوژی",
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "فصل ۱: سلول و بافت",
      sortOrder: 1,
      summaryContent: "خلاصه کامل فصل ۱",
    });

    const doc2Id = asDocumentId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
      documentId: doc2Id,
      title: "فصل ۲: دستگاه عصبی",
      sortOrder: 2,
      summaryContent: "خلاصه محرمانه فصل ۲",
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.preview).toBeDefined();
    expect(body.preview.preview_document_id).toBe(doc1Id);
    expect(body.course.locked).toBe(true);
    expect(body.access.granted).toBe(false);
  });

  it("Unentitled user: Chapter 1 (Preview) summary is 200 OK, Chapter 2 summary is 403 Forbidden", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-summary-2@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "دوره فیزیولوژی جامع",
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "فصل ۱: مقدمات",
      sortOrder: 1,
      summaryContent: "خلاصه رایگان فصل اول",
    });

    const doc2Id = asDocumentId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
      documentId: doc2Id,
      title: "فصل ۲: فیزیولوژی قلب",
      sortOrder: 2,
      summaryContent: "خلاصه غیررایگان فصل دوم",
    });

    // 1. Fetch Review Summary for Document 1 (Preview Chapter) -> 200 OK
    const resDoc1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc1Id}/review-summary`,
      cookies: student.cookies,
    });
    expect(resDoc1.statusCode).toBe(200);
    const bodyDoc1 = JSON.parse(resDoc1.body);
    expect(bodyDoc1.content).toBeDefined();
    expect(bodyDoc1.content.payload.text).toBe("خلاصه رایگان فصل اول");

    // 2. Fetch Review Summary for Document 2 (Locked Chapter) -> 403 Forbidden
    const resDoc2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc2Id}/review-summary`,
      cookies: student.cookies,
    });
    expect(resDoc2.statusCode).toBe(403);
    const bodyDoc2 = JSON.parse(resDoc2.body);
    expect(bodyDoc2.error).toBeDefined();
    // Verify no summary content is leaked
    expect(bodyDoc2.content).toBeUndefined();
    expect(resDoc2.body).not.toContain("خلاصه غیررایگان فصل دوم");

    // 3. Attempt to generate Review Summary for Document 2 without entitlement -> 403 Forbidden
    const resGenDoc2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc2Id}/review-summary`,
      cookies: student.cookies,
    });
    expect(resGenDoc2.statusCode).toBe(403);
  });

  it("Entitled user with purchased course: has full 200 OK access to all chapters' review summaries", async () => {
    const app = await buildTestApp();
    const buyer = await registerUser(app, "buyer-summary@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "دوره جامع با خرید مستقیم",
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "فصل ۱",
      sortOrder: 1,
      summaryContent: "خلاصه فصل ۱",
    });

    const doc2Id = asDocumentId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
      documentId: doc2Id,
      title: "فصل ۲",
      sortOrder: 2,
      summaryContent: "خلاصه فصل ۲",
    });

    const now = new Date().toISOString();
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: buyer.userId,
      resourceType: "course",
      resourceId: courseId,
      grantedReason: "course_purchase",
      sourceOrderId: randomUUID() as any,
      status: "active",
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Chapter 1 Review Summary -> 200 OK
    const resDoc1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc1Id}/review-summary`,
      cookies: buyer.cookies,
    });
    expect(resDoc1.statusCode).toBe(200);

    // 2. Chapter 2 Review Summary -> 200 OK
    const resDoc2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc2Id}/review-summary`,
      cookies: buyer.cookies,
    });
    expect(resDoc2.statusCode).toBe(200);
    const bodyDoc2 = JSON.parse(resDoc2.body);
    expect(bodyDoc2.content.payload.text).toBe("خلاصه فصل ۲");
  });

  it("Active subscriber user: has full 200 OK access to all chapters' review summaries", async () => {
    const app = await buildTestApp();
    const subscriber = await registerUser(app, "subscriber-summary@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "دوره تحت اشتراک",
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "فصل اول اشتراکی",
      sortOrder: 1,
      summaryContent: "خلاصه فصل ۱ اشتراکی",
    });

    const doc2Id = asDocumentId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
      documentId: doc2Id,
      title: "فصل دوم اشتراکی",
      sortOrder: 2,
      summaryContent: "خلاصه فصل ۲ اشتراکی",
    });

    // Seed active subscription
    await commerceStore.createSubscription({
      id: randomUUID() as any,
      userId: subscriber.userId,
      organizationId: orgId,
      planId: randomUUID() as any,
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const resDoc2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc2Id}/review-summary`,
      cookies: subscriber.cookies,
    });
    expect(resDoc2.statusCode).toBe(200);
    const bodyDoc2 = JSON.parse(resDoc2.body);
    expect(bodyDoc2.content.payload.text).toBe("خلاصه فصل ۲ اشتراکی");
  });

  it("Course creator / admin: has full access to all review summaries", async () => {
    const app = await buildTestApp();
    const creator = await registerUser(app, "creator-summary@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "دوره اختصاصی استاد",
      createdBy: creator.userId,
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "فصل ۱",
      sortOrder: 1,
      summaryContent: "خلاصه ۱",
    });

    const doc2Id = asDocumentId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
      documentId: doc2Id,
      title: "فصل ۲",
      sortOrder: 2,
      summaryContent: "خلاصه ۲",
    });

    const resDoc2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc2Id}/review-summary`,
      cookies: creator.cookies,
    });
    expect(resDoc2.statusCode).toBe(200);
  });

  it("Single-chapter course + unentitled user: Chapter 1 is 200 OK preview", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-single-doc@test.com");
    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "مینی دوره تک فصلی",
      publicationStatus: "published",
    });
    await seedPaidProduct(courseId);

    const doc1Id = asDocumentId(randomUUID());
    const mod1Id = asModuleId(randomUUID());
    await seedDocumentAndModule({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
      documentId: doc1Id,
      title: "تنها فصل دوره",
      sortOrder: 1,
      summaryContent: "خلاصه کل دوره تک فصلی",
    });

    const resDoc1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${doc1Id}/review-summary`,
      cookies: student.cookies,
    });
    expect(resDoc1.statusCode).toBe(200);
    const bodyDoc1 = JSON.parse(resDoc1.body);
    expect(bodyDoc1.content.payload.text).toBe("خلاصه کل دوره تک فصلی");
  });
});
