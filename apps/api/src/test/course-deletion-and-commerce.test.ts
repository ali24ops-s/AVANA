import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
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
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import {
  orders,
  userSubscriptions,
  userEntitlements,
  products,
} from "@avana/database/schema";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";

describe("Official Course Deletion & Security Invariants", () => {
  const officialOrgId = asOrganizationId("b4a0b464-16db-4087-92b7-163a1e6f6776");
  const adminActor: Actor = {
    userId: asUserId("admin-ops-user"),
    role: "platform_admin",
  };
  const studentActor: Actor = {
    userId: asUserId("student-user"),
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
  let entitlementService: EntitlementService;

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;

  const mockDbOrders: Array<{ id: string; productId: string; status?: string; amount?: number }> = [];
  const mockDbSubscriptions: Array<{ id: string; productId: string; status: string; expiresAt: Date }> = [];
  const mockDbEntitlements: Array<{ id: string; resourceType: string; resourceId: string; expiresAt?: Date | null; userId?: string }> = [];
  const mockAuditLogs: any[] = [];
  const courseProducts = new Map<string, any>();

  const extractParams = (cond: any): string[] => {
    if (!cond) return [];
    const values: string[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (typeof node === "string" || typeof node === "number") {
        values.push(String(node));
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === "object") {
        if ("value" in node) {
          if (Array.isArray(node.value)) {
            node.value.forEach(walk);
          } else if (node.value !== undefined && node.value !== null) {
            values.push(String(node.value));
          }
        }
        if (Array.isArray(node.queryChunks)) {
          node.queryChunks.forEach(walk);
        }
      }
    };
    walk(cond);
    return values;
  };

  const mockDb: any = {
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => {
          const execute = async () => {
            const symName = (table as any)?.[Symbol.for("drizzle:Name")] || (table as any)?.[Symbol.for("drizzle:OriginalName")];
            const name = table?._?.name || table?._tableName || symName || "";
            const params = extractParams(condition);

            if (table === orders || name === "orders") {
              if (params.length === 0) return mockDbOrders;
              return mockDbOrders.filter((o) => {
                const matchesProd = params.includes(o.productId);
                const matchesStatus =
                  params.includes("paid") || params.includes("completed")
                    ? o.status === "paid" || o.status === "completed"
                    : true;
                return matchesProd && matchesStatus;
              });
            }
            if (table === userSubscriptions || name === "user_subscriptions") {
              const now = new Date();
              const activeSubs = mockDbSubscriptions.filter(
                (s) => s.status === "active" && new Date(s.expiresAt) > now,
              );
              if (params.length === 0) return activeSubs;
              return activeSubs.filter((s) => params.includes(s.productId));
            }
            if (table === userEntitlements || name === "user_entitlements") {
              if (params.length === 0) return mockDbEntitlements;
              return mockDbEntitlements.filter((e) => {
                const matchesResource = params.includes(e.resourceId);
                const matchesSource = params.includes("purchase")
                  ? e.sourceType === "purchase"
                  : true;
                // If query checks isNotNull(orderId) or purchase
                const matchesOrder = params.includes("purchase")
                  ? Boolean(e.orderId)
                  : true;
                return matchesResource && matchesSource && matchesOrder;
              });
            }
            if (table === products || name === "products") {
              const prods = Array.from(courseProducts.values());
              if (params.length === 0) return prods;
              return prods.filter(
                (p) => params.includes(p.id) || params.includes(p.targetId) || params.includes(p.code),
              );
            }
            return [];
          };
          return {
            then: (onfulfilled: any, onrejected: any) => execute().then(onfulfilled, onrejected),
            limit: async (n?: number) => {
              const res = await execute();
              return res.slice(0, n || 1);
            },
          };
        },
      }),
    }),
    insert: (table: any) => ({
      values: (val: any) => {
        mockAuditLogs.push(val);
        return {
          then: (onfulfilled: any, onrejected: any) => Promise.resolve([val]).then(onfulfilled, onrejected),
          returning: async () => [val],
        };
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => ({
        where: (condition?: any) => {
          const symName = (table as any)?.[Symbol.for("drizzle:Name")] || (table as any)?.[Symbol.for("drizzle:OriginalName")];
          const name = table?._?.name || table?._tableName || symName || "";
          if (table === products || name === "products") {
            for (const prod of courseProducts.values()) {
              Object.assign(prod, vals);
            }
          }
          if (table === userEntitlements || name === "user_entitlements") {
            for (const ent of mockDbEntitlements) {
              Object.assign(ent, vals);
            }
            if (commerceStore) {
              const allCommerceEnts = commerceStore.entitlements;
              if (Array.isArray(allCommerceEnts)) {
                for (const ce of allCommerceEnts) {
                  if (vals.expiresAt) {
                    ce.expiresAt =
                      vals.expiresAt instanceof Date
                        ? vals.expiresAt.toISOString()
                        : vals.expiresAt;
                  }
                }
              }
            }
          }
          return {
            then: (onfulfilled: any, onrejected: any) => Promise.resolve([]).then(onfulfilled, onrejected),
            returning: async () => [],
          };
        },
      }),
    }),
    delete: (table: any) => ({
      where: (condition: any) => {
        if (table === products) {
          courseProducts.clear();
        }
        return Promise.resolve();
      },
    }),
    transaction: async (fn: any) => fn(mockDb),
  };

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
    orgStore = new InMemoryOrganizationStore();
    adminStore = new InMemoryAdminStore(undefined as any, orgStore, commerceStore);

    mockDbOrders.length = 0;
    mockDbSubscriptions.length = 0;
    mockDbEntitlements.length = 0;
    mockAuditLogs.length = 0;
    courseProducts.clear();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    });

    modelGateway = new MockModelGateway();
    generationService = new GenerationService(
      modelGateway,
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

    reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      courseStore,
    );

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
  });

  it("1. Successfully deletes a draft course when confirmationName matches exactly", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره آزمایشی زیست‌شناسی",
      subject: "زیست",
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره آزمایشی زیست‌شناسی",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);
    expect(result.courseName).toBe("دوره آزمایشی زیست‌شناسی");

    const found = await courseStore.findById(course.id);
    expect(found).toBeUndefined();

    const audit = mockAuditLogs.find((a) => a.action === "COURSE_PERMANENTLY_DELETED");
    expect(audit).toBeDefined();
    expect(audit.entityId).toBe(course.id);
  });

  it("2. Successfully deletes a course in 'generating' and 'review' statuses", async () => {
    const course1 = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره در حال تولید هوش مصنوعی",
    });
    course1.status = "generating";
    await courseStore.update(course1);

    const res1 = await officialContentService.deleteOfficialCourse(adminActor, course1.id, {
      confirmationName: "دوره در حال تولید هوش مصنوعی",
    });
    expect(res1.success).toBe(true);

    const course2 = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره در حال بازبینی محتوا",
    });
    course2.status = "review";
    await courseStore.update(course2);

    const res2 = await officialContentService.deleteOfficialCourse(adminActor, course2.id, {
      confirmationName: "دوره در حال بازبینی محتوا",
    });
    expect(res2.success).toBe(true);
  });

  it("3. Successfully deletes a 'published' course if there are ZERO orders and ZERO entitlements", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره منتشر شده فارماکولوژی",
    });
    course.status = "published";
    await courseStore.update(course);

    // Linked product exists with 0 orders
    courseProducts.set("prod-pub-1", {
      id: "prod-pub-1",
      targetType: "course",
      targetId: course.id,
      price: 250000,
      active: true,
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره منتشر شده فارماکولوژی",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);
    expect(result.deletedProduct).toBe(true);

    // Course should no longer exist in course store
    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeUndefined();

    // Audit log should be recorded
    const audit = mockAuditLogs.find((a) => a.action === "COURSE_PERMANENTLY_DELETED" && a.entityId === course.id);
    expect(audit).toBeDefined();
    expect(audit.details.status).toBe("published");
  });

  it("Test A — Active entitlement does NOT block deletion; access is revoked while records are preserved", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره دارو درمانی فعال",
    });
    course.status = "published";
    await courseStore.update(course);

    mockDbEntitlements.push({
      id: "ent-active-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: null, // Lifetime active access
      userId: "user-1",
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره دارو درمانی فعال",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeUndefined();

    // Entitlement is revoked (expiresAt set to timestamp), not corruptly destroyed
    const ent = mockDbEntitlements.find((e) => e.id === "ent-active-1");
    expect(ent).toBeDefined();
    expect(ent?.expiresAt).toBeInstanceOf(Date);
  });

  it("Test B — Revoked entitlement does NOT block deletion", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره دارو درمانی لغو شده",
    });
    course.status = "published";
    await courseStore.update(course);

    // Revoked entitlement has past expiresAt
    mockDbEntitlements.push({
      id: "ent-revoked-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: new Date(Date.now() - 60000), // 1 minute in the past
      userId: "user-1",
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره دارو درمانی لغو شده",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeUndefined();
  });

  it("Test C — Expired entitlement does NOT block deletion", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره دارو درمانی منقضی شده",
    });
    course.status = "published";
    await courseStore.update(course);

    // Entitlement expired yesterday
    mockDbEntitlements.push({
      id: "ent-expired-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: new Date(Date.now() - 86400000),
      userId: "user-2",
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره دارو درمانی منقضی شده",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeUndefined();
  });

  it("Test D — Historical order does NOT block deletion when access is revoked", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره دارو درمانی با سابقه خرید",
    });
    course.status = "published";
    await courseStore.update(course);

    const prodId = "prod-pharma-1";
    courseProducts.set(prodId, {
      id: prodId,
      targetType: "course",
      targetId: course.id,
      price: 300000,
      active: true,
    });

    // Historical purchase order
    mockDbOrders.push({
      id: "order-hist-1",
      productId: prodId,
      status: "completed",
      amount: 300000,
    });

    // Entitlement was revoked (expiresAt in past)
    mockDbEntitlements.push({
      id: "ent-pharma-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: new Date(Date.now() - 1000),
      userId: "user-3",
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره دارو درمانی با سابقه خرید",
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeUndefined();
  });

  it("Test E — Financial history survives cleanly without deletion or corruption", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره حفظ سوابق مالی",
    });
    course.status = "published";
    await courseStore.update(course);

    const prodId = "prod-fin-1";
    courseProducts.set(prodId, {
      id: prodId,
      targetType: "course",
      targetId: course.id,
      price: 500000,
      active: true,
    });

    mockDbOrders.push({
      id: "order-fin-1",
      productId: prodId,
      status: "completed",
      amount: 500000,
    });

    mockDbEntitlements.push({
      id: "ent-fin-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: new Date(Date.now() - 10000),
    });

    await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره حفظ سوابق مالی",
    });

    // 1. Orders table is 100% preserved
    expect(mockDbOrders.length).toBe(1);
    expect(mockDbOrders[0].id).toBe("order-fin-1");
    expect(mockDbOrders[0].productId).toBe(prodId);
    expect(mockDbOrders[0].amount).toBe(500000);

    // 2. Product is preserved in DB but deactivated and soft-deleted
    const prod = courseProducts.get(prodId);
    expect(prod).toBeDefined();
    expect(prod.active).toBe(false);
    expect(prod.deletedAt).toBeDefined();

    // 3. Audit log is emitted
    const audit = mockAuditLogs.find((a) => a.action === "COURSE_PERMANENTLY_DELETED" && a.entityId === course.id);
    expect(audit).toBeDefined();
  });

  it("Test F — Verification that active course entitlements count = 0 permits deletion", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره تأیید عدم وجود دسترسی فعال",
    });
    course.status = "published";
    await courseStore.update(course);

    const now = new Date();
    // Only expired entitlements in DB
    mockDbEntitlements.push(
      { id: "e1", resourceType: "course", resourceId: course.id, expiresAt: new Date(now.getTime() - 5000) },
      { id: "e2", resourceType: "course", resourceId: course.id, expiresAt: new Date(now.getTime() - 10000) },
    );

    const activeCount = mockDbEntitlements.filter(
      (e) => e.resourceId === course.id && (!e.expiresAt || new Date(e.expiresAt) > now),
    ).length;
    expect(activeCount).toBe(0);

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره تأیید عدم وجود دسترسی فعال",
    });
    expect(result.success).toBe(true);
  });

  it("Test G — Active subscription for different product or global subscription is unaffected", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره مستقل از اشتراک سراسری",
    });
    course.status = "published";
    await courseStore.update(course);

    // User has active global subscription
    await commerceStore.createSubscription({
      id: "sub-global-1" as any,
      userId: asUserId("student-user"),
      productId: "prod-sub-global" as any,
      status: "active",
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره مستقل از اشتراک سراسری",
    });
    expect(result.success).toBe(true);

    const activeSub = await commerceStore.findActiveSubscription(asUserId("student-user"));
    expect(activeSub).toBeDefined();
    expect(activeSub?.status).toBe("active");
  });

  it("Test H — End-to-End Service Flow: Grant -> Access -> Revoke -> Deny -> Delete -> Financial Preserved", async () => {
    // 1. Create and publish course
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دارو درمانی بالینی E2E",
    });
    course.status = "published";
    await courseStore.update(course);

    const prodId = "prod-e2e-1";
    courseProducts.set(prodId, {
      id: prodId,
      targetType: "course",
      targetId: course.id,
      price: 450000,
      active: true,
    });

    // 2. Grant course entitlement to student
    const studentUser = studentActor.userId;
    await commerceStore.grantEntitlement({
      id: "ent-e2e-1" as any,
      userId: studentUser,
      resourceType: "course",
      resourceId: course.id,
      sourceType: "purchase",
      startsAt: new Date().toISOString(),
      expiresAt: null, // Lifetime active
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockDbOrders.push({
      id: "order-e2e-1",
      productId: prodId,
      status: "completed",
      amount: 450000,
    });

    // 3. Verify student has access
    const check1 = await entitlementService.checkAccess(studentActor, {
      courseId: course.id,
    });
    expect(check1.granted).toBe(true);

    // 4. Entitlement is in DB
    mockDbEntitlements.push({
      id: "ent-e2e-1",
      resourceType: "course",
      resourceId: course.id,
      expiresAt: null,
      userId: studentUser,
    });

    // 5. Delete course directly -> MUST succeed without 409 error
    const deleteRes = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دارو درمانی بالینی E2E",
    });
    expect(deleteRes.success).toBe(true);

    // 6. Verify student access is now revoked/terminated
    const check2 = await entitlementService.checkAccess(studentActor, {
      courseId: course.id,
    });
    expect(check2.granted).toBe(false);

    // 7. Verify course content deleted
    const deletedCourse = await courseStore.findById(course.id);
    expect(deletedCourse).toBeUndefined();

    // 8. Verify financial records and order history are 100% preserved
    expect(mockDbOrders.length).toBe(1);
    expect(mockDbOrders[0].id).toBe("order-e2e-1");
    expect(mockDbOrders[0].amount).toBe(450000);

    const prod = courseProducts.get(prodId);
    expect(prod).toBeDefined();
    expect(prod.active).toBe(false);
    expect(prod.deletedAt).toBeDefined();
  });

  it("Test I — listOfficialCourses correctly detects hasPurchaseHistory for courses with orders or entitlements", async () => {
    // 1. Fresh course without purchases
    const freshCourse = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره تازه بدون خرید",
    });

    // 2. Course with purchase order
    const purchasedCourse = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره دارای سابقه خرید",
    });
    const purchasedProdId = "prod-purchased-1";
    courseProducts.set(purchasedProdId, {
      id: purchasedProdId,
      targetType: "course",
      targetId: purchasedCourse.id,
      price: 200000,
      active: true,
    });
    mockDbOrders.push({
      id: "order-test-i-1",
      productId: purchasedProdId,
      status: "completed",
      amount: 200000,
    });

    const summaries = await officialContentService.listOfficialCourses(adminActor);
    const freshSummary = summaries.find((s) => s.id === freshCourse.id);
    const purchasedSummary = summaries.find((s) => s.id === purchasedCourse.id);

    expect(freshSummary?.hasPurchaseHistory).toBe(false);
    expect(purchasedSummary?.hasPurchaseHistory).toBe(true);
  });

  it("7. Rejects deletion with 400 Bad Request if confirmationName does not match", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره بیوشیمی عمومی",
    });

    await expect(
      officialContentService.deleteOfficialCourse(adminActor, course.id, {
        confirmationName: "نام اشتباه",
      }),
    ).rejects.toMatchObject({
      code: "bad_request",
      message: expect.stringContaining("مطابقت ندارد"),
    });
  });

  it("8. Rejects deletion with 403 Forbidden for non-admin actor", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره محافظت شده",
    });

    await expect(
      officialContentService.deleteOfficialCourse(studentActor, course.id, {
        confirmationName: "دوره محافظت شده",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("9. Rejects deletion with 404 Not Found for non-existent course", async () => {
    await expect(
      officialContentService.deleteOfficialCourse(adminActor, randomUUID() as CourseId, {
        confirmationName: "دوره ناموجود",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("10. Respects deleteSourceDocuments=false and does not attempt document cleanup", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره با اسناد منبع بدون حذف",
    });

    const res = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره با اسناد منبع بدون حذف",
      deleteSourceDocuments: false,
    });

    expect(res.success).toBe(true);
    expect(res.deletedDocumentsCount).toBe(0);
  });

  it("11. Successfully deletes a published course that has NO product (product is null) and zero financial dependencies", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره جامع فارماکولوژی بدون محصول",
    });
    course.status = "published";
    await courseStore.update(course);

    // Explicitly verify NO product exists in courseProducts map
    expect(courseProducts.has("prod-null")).toBe(false);

    const result = await officialContentService.deleteOfficialCourse(adminActor, course.id, {
      confirmationName: "دوره جامع فارماکولوژی بدون محصول",
      deleteSourceDocuments: false,
    });

    expect(result.success).toBe(true);
    expect(result.deletedCourseId).toBe(course.id);
    expect(result.deletedProduct).toBe(false);

    const found = await courseStore.findById(course.id);
    expect(found).toBeUndefined();

    const audit = mockAuditLogs.find((a) => a.action === "COURSE_PERMANENTLY_DELETED" && a.entityId === course.id);
    expect(audit).toBeDefined();
    expect(audit.details.deletedProduct).toBe(false);
  });

  describe("hasPurchaseHistory 12 Scenarios Audit Matrix", () => {
    it("Scenario 1: Completed / Paid order returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۱" });
      const prodId = "prod-sc-1";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-1", productId: prodId, status: "paid", amount: 100000 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 2: Pending order returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۲" });
      const prodId = "prod-sc-2";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-2", productId: prodId, status: "pending", amount: 100000 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });

    it("Scenario 3: Failed / Cancelled order returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۳" });
      const prodId = "prod-sc-3";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-3a", productId: prodId, status: "failed", amount: 100000 });
      mockDbOrders.push({ id: "order-sc-3b", productId: prodId, status: "cancelled", amount: 100000 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });

    it("Scenario 4: Expired entitlement with historical completed purchase returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۴" });
      const prodId = "prod-sc-4";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-4", productId: prodId, status: "completed", amount: 200000 });
      mockDbEntitlements.push({
        id: "ent-sc-4",
        resourceType: "course",
        resourceId: course.id,
        sourceType: "purchase",
        orderId: "order-sc-4",
        expiresAt: new Date(Date.now() - 60000), // Expired in past
      });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 5: Revoked entitlement with past completed purchase returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۵" });
      const prodId = "prod-sc-5";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-5", productId: prodId, status: "completed", amount: 150000 });
      // Entitlement revoked
      mockDbEntitlements.push({
        id: "ent-sc-5",
        resourceType: "course",
        resourceId: course.id,
        sourceType: "purchase",
        orderId: "order-sc-5",
        expiresAt: new Date(Date.now() - 5000),
      });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 6: admin_grant without purchase order returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۶" });
      mockDbEntitlements.push({
        id: "ent-sc-6",
        resourceType: "course",
        resourceId: course.id,
        sourceType: "admin_grant",
        orderId: null,
      });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });

    it("Scenario 7: gift entitlement without purchase order returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۷" });
      mockDbEntitlements.push({
        id: "ent-sc-7",
        resourceType: "course",
        resourceId: course.id,
        sourceType: "gift",
        orderId: null,
      });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });

    it("Scenario 8: Test / Seed entitlement without purchase order returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۸" });
      mockDbEntitlements.push({
        id: "ent-sc-8",
        resourceType: "course",
        resourceId: course.id,
        sourceType: "test_seed",
        orderId: null,
      });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });

    it("Scenario 9: Completed order with 100% discount / 0 amount returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۹" });
      const prodId = "prod-sc-9";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      mockDbOrders.push({ id: "order-sc-9", productId: prodId, status: "completed", amount: 0 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 10: Soft-deleted / Decommissioned product with past completed order returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۱۰" });
      const prodId = "prod-sc-10";
      courseProducts.set(prodId, {
        id: prodId,
        targetType: "course",
        targetId: course.id,
        active: false,
        deletedAt: new Date(Date.now() - 3600000), // Soft-deleted product
      });
      mockDbOrders.push({ id: "order-sc-10", productId: prodId, status: "completed", amount: 400000 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 11: Multiple products for one course where only one has completed order returns hasPurchaseHistory = true", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۱۱" });
      const prod1 = "prod-sc-11a";
      const prod2 = "prod-sc-11b";
      courseProducts.set(prod1, { id: prod1, targetType: "course", targetId: course.id, active: false });
      courseProducts.set(prod2, { id: prod2, targetType: "course", targetId: course.id, active: true });

      mockDbOrders.push({ id: "order-sc-11a", productId: prod1, status: "failed", amount: 100000 });
      mockDbOrders.push({ id: "order-sc-11b", productId: prod2, status: "completed", amount: 250000 });

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(true);
    });

    it("Scenario 12: Course without any commercial history returns hasPurchaseHistory = false", async () => {
      const course = await officialContentService.createOfficialCourse(adminActor, { name: "دوره سناریو ۱۲" });
      const prodId = "prod-sc-12";
      courseProducts.set(prodId, { id: prodId, targetType: "course", targetId: course.id, active: true });
      // No orders, no entitlements

      const coursesList = await officialContentService.listOfficialCourses(adminActor);
      const item = coursesList.find((c) => c.id === course.id);
      expect(item?.hasPurchaseHistory).toBe(false);
    });
  });
});
