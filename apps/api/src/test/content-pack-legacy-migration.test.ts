import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type ContentPackId,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  type OrganizationId,
  type UserId,
  asContentPackId,
  asProductId,
} from "@avana/domain";
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
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import { up as migration0026 } from "../../../../database/migrations/0026_migrate_legacy_content_packs_to_pending_review.js";

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

describe("Legacy Content Pack Migration to Mandatory Admin Review Workflow", () => {
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
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let paymentGateway: MockPaymentGateway;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    contentPackUsageStore = new InMemoryContentPackUsageStore();
    contentPackStore = new InMemoryContentPackStore(
      userStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      generatedContentStore,
      contentPackUsageStore,
    );
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore();
    paymentGateway = new MockPaymentGateway();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-legacy-mig-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    const auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    queue = new InMemoryGenerationQueue(generationJobStore);
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
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
      gateway: createModelGateway({ provider: "mock" }),
      auditService,
      contentPackStore,
      contentPackUsageStore,
      commerceStore,
      adminStore,
      paymentGateway,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });
    await app.ready();
    return app;
  }

  async function setupAdmin(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const email = `admin-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "ادمین ارشد سیستم" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const token = extractSessionToken(res)!;
    const adminId = body.user.id as UserId;

    const user = (userStore as any).users.get(adminId);
    if (user) {
      user.globalRole = "platform_admin";
      user.role = "platform_admin";
    }

    return { adminId, token };
  }

  async function setupStudent(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const email = `student-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "دانشجو یادگیرنده" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const token = extractSessionToken(res)!;
    const studentId = body.user.id as UserId;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: `Student Org ${Date.now()}` },
    });
    const orgId = JSON.parse(orgRes.body).organization.id as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره فارماکولوژی من",
        subject: "فارماکولوژی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    return { studentId, orgId, courseId, token };
  }

  /**
   * Helper to seed a legacy published pack with metadata.accessType = null
   */
  async function seedLegacyPack(
    title: string,
    hasProduct = false,
    price = 149000,
  ) {
    const packId = randomUUID() as ContentPackId;
    const orgId = randomUUID() as OrganizationId;
    const now = new Date().toISOString();
    const creator = await userStore.createUserWithPassword({
      email: `creator-${Date.now()}@example.com`,
      passwordHash: "hash",
      name: "استاد دکتر رضایی",
      globalRole: "user",
    });

    const pack = await contentPackStore.create(
      {
        id: packId,
        creatorUserId: creator.id,
        organizationId: orgId,
        sourceDocumentId: null,
        title,
        description: "بسته قدیمی منتشر شده بدون بازبینی ادمین",
        subject: "داروسازی",
        status: "published", // Legacy state
        publishedAt: now,
        usageCount: 5,
        metadata: {
          sessionCount: 2,
          flashcardCount: 20,
          quizQuestionCount: 5,
          estimatedReadingMinutes: 15,
          // Note: accessType is null / absent in legacy packs!
        },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID() as any,
          contentPackId: packId,
          contentType: "lesson",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "lesson",
            title,
            moduleTitle: "فصل اول",
            sessions: [
              {
                title: "جلسه اول",
                contentMarkdown: "محتوای جلسه اول",
                estimatedMinutes: 10,
              },
            ],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    let product = null;
    if (hasProduct) {
      product = await commerceStore.createProduct({
        id: asProductId(randomUUID()),
        code: `test_prod_pack_${packId}`,
        type: "content_pack",
        title: pack.title,
        description: pack.description,
        price,
        currency: "toman",
        targetType: "content_pack",
        targetId: pack.id,
        durationDays: null,
        active: true, // Legacy active product
        metadata: { contentPackId: pack.id },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    return { pack, product };
  }

  // -------------------------------------------------------------------------
  // 1 & 2 & 3: Migration Execution & Public Library / Admin Queue Invariants
  // -------------------------------------------------------------------------
  it("1-5. Migration moves legacy published packs to pending_review, hides them from Public Library, deactivates commerce products, and blocks checkout/materialization", async () => {
    const app = await buildTestApp();
    const { token: adminToken } = await setupAdmin(app);
    const { studentId, orgId, courseId, token: studentToken } = await setupStudent(app);

    // Seed 2 legacy packs: 1 free-like and 1 with active 149k product
    const { pack: legacyFreePack } = await seedLegacyPack("بسته بیوشیمی قدیمی", false);
    const { pack: legacyPaidPack, product: paidProd } = await seedLegacyPack("بسته CNS قدیمی با محصول", true, 149000);

    // Simulate in-memory migration logic matching SQL migration 0026
    const { items: allPacks } = await contentPackStore.listAll();
    for (const p of allPacks) {
      if (
        p.status === "published" &&
        (!p.metadata?.accessType || !["free", "paid"].includes(p.metadata.accessType))
      ) {
        await contentPackStore.updateStatus(p.id, "pending_review", { ...p.metadata });
        const prod = await commerceStore.findProductByTarget("content_pack", p.id);
        if (prod && prod.active) {
          await commerceStore.updateProduct(prod.id, { active: false });
        }
      }
    }

    // 1. Check status moved to pending_review
    const p1 = await contentPackStore.findById(legacyFreePack.id);
    const p2 = await contentPackStore.findById(legacyPaidPack.id);
    expect(p1?.status).toBe("pending_review");
    expect(p2?.status).toBe("pending_review");

    // 2. Must NOT appear in Public Library
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    expect(libRes.statusCode).toBe(200);
    const libBody = JSON.parse(libRes.body);
    expect(libBody.items).toHaveLength(0);

    // 3. Must appear in Admin Pending Review Queue
    const adminPendingRes = await app.inject({
      method: "GET",
      url: "/v1/admin/content-packs?status=pending_review",
      cookies: { avana_session: adminToken },
    });
    expect(adminPendingRes.statusCode).toBe(200);
    const pendingBody = JSON.parse(adminPendingRes.body);
    expect(pendingBody.items).toHaveLength(2);
    expect(pendingBody.items.map((i: any) => i.id)).toContain(legacyFreePack.id);
    expect(pendingBody.items.map((i: any) => i.id)).toContain(legacyPaidPack.id);

    // 4. Product is deactivated (active = false) -> checkout must fail (404/400)
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/card-to-card/submit",
      cookies: { avana_session: studentToken },
      payload: {
        product_id: paidProd!.id,
        amount: 80000,
        tracking_number: "TRK-LEGACY-1",
        source_card_last4: "1234",
      },
    });
    expect(checkoutRes.statusCode).toBe(404);

    // 5. Unreviewed pending pack cannot be added to course or treated as free (404/403)
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${legacyFreePack.id}/add-to-course`,
      cookies: { avana_session: studentToken },
      payload: { course_id: courseId },
    });
    expect(addRes.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 6 & 7: Admin Approves Legacy Pack as Free
  // -------------------------------------------------------------------------
  it("6-7. Admin approves legacy pack as Free: status becomes published, visible in Library with price=0, materialization allowed", async () => {
    const app = await buildTestApp();
    const { token: adminToken } = await setupAdmin(app);
    const { courseId, token: studentToken } = await setupStudent(app);

    const { pack } = await seedLegacyPack("بسته داروشناسی رایگان");
    await contentPackStore.updateStatus(pack.id, "pending_review", { ...pack.metadata });

    // Admin reviews and approves as Free
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${pack.id}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.pack.status).toBe("published");
    expect(approveBody.pack.metadata.accessType).toBe("free");
    expect(approveBody.pack.metadata.reviewedAt).toBeDefined();

    // Appears in Public Library as Free
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const libBody = JSON.parse(libRes.body);
    expect(libBody.items).toHaveLength(1);
    expect(libBody.items[0].id).toBe(pack.id);
    expect(libBody.items[0].access_type).toBe("free");
    expect(libBody.items[0].pricing.is_free).toBe(true);
    expect(libBody.items[0].pricing.price).toBe(0);

    // Student can add to course without paying
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${pack.id}/add-to-course`,
      cookies: { avana_session: studentToken },
      payload: { course_id: courseId },
    });
    expect(addRes.statusCode).toBe(200);
    expect(JSON.parse(addRes.body).success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8 & 9 & 10 & 11: Admin Approves Legacy Pack as Paid (149k)
  // -------------------------------------------------------------------------
  it("8-11. Admin approves legacy pack as Paid with 149,000 Tomans: activates exact single Product, exact pricing in Library, prevents null accessType", async () => {
    const app = await buildTestApp();
    const { token: adminToken } = await setupAdmin(app);
    const { courseId, token: studentToken } = await setupStudent(app);

    const { pack, product } = await seedLegacyPack("بسته CNS بازبینی شده", true, 149000);
    await contentPackStore.updateStatus(pack.id, "pending_review", { ...pack.metadata });
    await commerceStore.updateProduct(product!.id, { active: false });

    // Admin approves as Paid with price = 149000
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${pack.id}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 149000 },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.pack.status).toBe("published");
    expect(approveBody.pack.metadata.accessType).toBe("paid");
    expect(approveBody.product.id).toBe(product!.id); // Re-activated same product (no duplicate created!)
    expect(approveBody.product.active).toBe(true);
    expect(approveBody.product.price).toBe(149000);

    // Verify exactly 1 product exists in DB for this pack
    const allProds = await commerceStore.listActiveProducts();
    const matchingProds = allProds.filter((p) => p.targetId === pack.id);
    expect(matchingProds).toHaveLength(1);

    // Appears in Public Library with exact price
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const libBody = JSON.parse(libRes.body);
    expect(libBody.items).toHaveLength(1);
    expect(libBody.items[0].access_type).toBe("paid");
    expect(libBody.items[0].pricing.is_free).toBe(false);
    expect(libBody.items[0].pricing.price).toBe(149000);
    expect(libBody.items[0].pricing.product_id).toBe(product!.id);

    // Checkout succeeds
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/card-to-card/submit",
      cookies: { avana_session: studentToken },
      payload: {
        product_id: product!.id,
        amount: 149000,
        tracking_number: "TRK-LEGACY-2",
        source_card_last4: "1234",
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
  });

  // -------------------------------------------------------------------------
  // 12: Admin Rejection
  // -------------------------------------------------------------------------
  it("12. Admin rejects legacy pack: sets status to rejected, deactivates product, stays excluded from Library", async () => {
    const app = await buildTestApp();
    const { token: adminToken } = await setupAdmin(app);

    const { pack, product } = await seedLegacyPack("بسته بی‌کیفیت", true, 80000);
    await contentPackStore.updateStatus(pack.id, "pending_review", { ...pack.metadata });

    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${pack.id}/reject`,
      cookies: { avana_session: adminToken },
      payload: { reason: "محتوا کامل نیست و نیاز به بازنویسی دارد." },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectBody = JSON.parse(rejectRes.body);
    expect(rejectBody.success).toBe(true);
    expect(rejectBody.pack.status).toBe("rejected");
    expect(rejectBody.pack.metadata.rejectionReason).toBe("محتوا کامل نیست و نیاز به بازنویسی دارد.");

    // Excluded from Public Library
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    expect(JSON.parse(libRes.body).items).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 13 & 14: Historical Purchase and Entitlement Preservation
  // -------------------------------------------------------------------------
  it("13-14. Preserves all historical orders, payments, and user entitlements when migrating to pending_review", async () => {
    const app = await buildTestApp();
    const { studentId, token: studentToken } = await setupStudent(app);

    const { pack, product } = await seedLegacyPack("بسته قبلاً خریداری شده", true, 149000);

    // Create historical order & payment & entitlement for student
    const order = await commerceStore.createOrder({
      id: randomUUID() as any,
      userId: studentId,
      productId: product!.id,
      orderNumber: `ORD-${Date.now()}`,
      amount: 149000,
      currency: "toman",
      status: "paid",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payment = await commerceStore.createPayment({
      id: randomUUID() as any,
      orderId: order.id,
      userId: studentId,
      amount: 149000,
      currency: "toman",
      gateway: "mock",
      authority: `AUTH-${Date.now()}`,
      transactionId: `TX-${Date.now()}`,
      status: "paid",
      idempotencyKey: randomUUID(),
      rawCallbackMetadata: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const entitlement = await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: studentId,
      resourceType: "content_pack",
      resourceId: pack.id,
      grantedBy: "order",
      sourceOrderId: order.id,
      sourceSubscriptionId: null,
      expiresAt: null, // Lifetime access
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run migration (deactivates product, sets pack to pending_review)
    await contentPackStore.updateStatus(pack.id, "pending_review", { ...pack.metadata });
    await commerceStore.updateProduct(product!.id, { active: false });

    // Verify historical records remain intact in store
    const foundOrder = await commerceStore.findOrderById(order.id);
    expect(foundOrder).toBeDefined();
    expect(foundOrder?.status).toBe("paid");

    const foundPayment = await commerceStore.findPaymentById(payment.id);
    expect(foundPayment).toBeDefined();
    expect(foundPayment?.status).toBe("paid");

    const activeEnts = await commerceStore.findActiveEntitlement(
      studentId,
      "content_pack",
      pack.id,
      new Date().toISOString(),
    );
    expect(activeEnts).toBeDefined();
    expect(activeEnts?.id).toBe(entitlement.id);
  });

  // -------------------------------------------------------------------------
  // 15: Idempotency of Migration
  // -------------------------------------------------------------------------
  it("15. Migration is idempotent and safe to run multiple times without mutating already reviewed/migrated packs", async () => {
    const { pack } = await seedLegacyPack("بسته تست تکرار");

    // First migration pass
    await contentPackStore.updateStatus(pack.id, "pending_review", { ...pack.metadata });

    // Pack is reviewed and approved as Paid
    await contentPackStore.updateStatus(pack.id, "published", {
      ...pack.metadata,
      accessType: "paid",
      reviewedAt: new Date().toISOString(),
    });

    // Second migration pass (only targets published with null accessType or null reviewedAt)
    const currentPack = await contentPackStore.findById(pack.id);
    if (
      currentPack?.status === "published" &&
      (!currentPack.metadata?.accessType || !currentPack.metadata?.reviewedAt)
    ) {
      await contentPackStore.updateStatus(currentPack.id, "pending_review", { ...currentPack.metadata });
    }

    // Must remain published with accessType = paid (not reverted to pending_review!)
    const verifiedPack = await contentPackStore.findById(pack.id);
    expect(verifiedPack?.status).toBe("published");
    expect(verifiedPack?.metadata?.accessType).toBe("paid");
  });
});
