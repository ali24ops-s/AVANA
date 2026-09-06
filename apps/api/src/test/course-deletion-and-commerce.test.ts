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
import { DomainError } from "@avana/domain";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import {
  orders,
  userEntitlements,
  products,
  documents,
  auditLogs,
} from "@avana/database/schema";

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

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;

  const mockDbOrders: Array<{ id: string; productId: string }> = [];
  const mockDbEntitlements: Array<{ id: string; resourceType: string; resourceId: string }> = [];
  const mockAuditLogs: any[] = [];
  const courseProducts = new Map<string, any>();

  const mockDb: any = {
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => {
          const execute = async () => {
            const symName = (table as any)?.[Symbol.for("drizzle:Name")] || (table as any)?.[Symbol.for("drizzle:OriginalName")];
            const name = table?._?.name || table?._tableName || symName || "";
            if (table === orders || name === "orders") {
              return mockDbOrders;
            }
            if (table === userEntitlements || name === "user_entitlements") {
              return mockDbEntitlements;
            }
            if (table === products || name === "products") {
              return Array.from(courseProducts.values());
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
        where: () => ({
          then: (onfulfilled: any, onrejected: any) => Promise.resolve([]).then(onfulfilled, onrejected),
          returning: async () => [],
        }),
      }),
    }),
    delete: (table: any) => ({
      where: (condition: any) => {
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
    adminStore = new InMemoryAdminStore();
    orgStore = new InMemoryOrganizationStore();

    mockDbOrders.length = 0;
    mockDbEntitlements.length = 0;
    mockAuditLogs.length = 0;
    courseProducts.clear();

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

  it("4. Rejects deletion with 409 Conflict if published course has financial orders", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره منتشر شده با سفارش مالی",
    });
    course.status = "published";
    await courseStore.update(course);

    courseProducts.set("prod-1", {
      id: "prod-1",
      targetType: "course",
      targetId: course.id,
    });
    mockDbOrders.push({ id: "order-1", productId: "prod-1" });

    await expect(
      officialContentService.deleteOfficialCourse(adminActor, course.id, {
        confirmationName: "دوره منتشر شده با سفارش مالی",
      }),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("سابقه خرید یا دسترسی کاربران"),
    });

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeDefined();
  });

  it("5. Rejects deletion with 409 Conflict if published course has user entitlements", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره منتشر شده با دسترسی کاربر",
    });
    course.status = "published";
    await courseStore.update(course);

    mockDbEntitlements.push({
      id: "ent-1",
      resourceType: "course",
      resourceId: course.id,
    });

    await expect(
      officialContentService.deleteOfficialCourse(adminActor, course.id, {
        confirmationName: "دوره منتشر شده با دسترسی کاربر",
      }),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("سابقه خرید یا دسترسی کاربران"),
    });

    const stillExists = await courseStore.findById(course.id);
    expect(stillExists).toBeDefined();
  });

  it("6. Rejects deletion with 409 Conflict if published course has both orders and entitlements", async () => {
    const course = await officialContentService.createOfficialCourse(adminActor, {
      name: "دوره منتشر شده با سفارش و دسترسی",
    });
    course.status = "published";
    await courseStore.update(course);

    courseProducts.set("prod-2", {
      id: "prod-2",
      targetType: "course",
      targetId: course.id,
    });
    mockDbOrders.push({ id: "order-2", productId: "prod-2" });
    mockDbEntitlements.push({
      id: "ent-2",
      resourceType: "course",
      resourceId: course.id,
    });

    await expect(
      officialContentService.deleteOfficialCourse(adminActor, course.id, {
        confirmationName: "دوره منتشر شده با سفارش و دسترسی",
      }),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("سابقه خرید یا دسترسی کاربران"),
    });
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
});
