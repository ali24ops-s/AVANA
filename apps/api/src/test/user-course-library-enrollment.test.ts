/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Comprehensive Integration & Verification Suite for Approved User-Created Courses:
 * Public Library Discovery, Organization Catalog Selection, and "My Courses" Enrollment.
 *
 * Verifies all 12 core acceptance criteria and invariants:
 * 1. Official courses behavior preserved (official/systemOrg courses).
 * 2. User-created approved course displayed in public library (GET /v1/library/resources).
 * 3. User-created approved course displayed in course selector (GET /v1/organizations/:orgId/courses).
 * 4. Adding user-created approved course succeeds (POST /v1/organizations/:orgId/courses/my).
 * 5. Enrolled user-created course listed in GET /v1/organizations/:orgId/courses/my.
 * 6. Idempotency: re-adding does not fail or duplicate.
 * 7. Unapproved (draft, pending_review, rejected) courses return 404 and are isolated.
 * 8. Access control: foreign users cannot update or delete the public course.
 * 9. Commercial rules preserved: paid course content remains gated by entitlements.
 * 10. Privacy preserved: no creator private info (email/userId) in course responses.
 * 11. No AI generation / Gemini re-invoked on adding.
 * 12. Own-organization courses and official courses continue to work as expected.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  asCourseId,
  asCoursePublicationId,
  asProductId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemorySubCourseGroupStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryCourseStore,
  InMemoryCoursePublicationStore,
} from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

describe("User-Created Approved Courses: Library & Enrollment (12 Invariants)", () => {
  let app: any;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let courseStore: InMemoryCourseStore;
  let coursePublicationStore: InMemoryCoursePublicationStore;
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;
  let generationQueue: InMemoryGenerationQueue;
  let config: ReturnType<typeof loadApiConfig>;

  let creatorToken: string;
  let creatorUserId: UserId;
  let creatorOrgId: OrganizationId;

  let learnerToken: string;
  let learnerUserId: UserId;
  let learnerOrgId: OrganizationId;

  let adminToken: string;
  let adminUserId: UserId;
  let adminOrgId: OrganizationId;

  async function createAuthenticatedUser(email: string, role: Role) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "secure_pass_hash_123",
      name: email.split("@")[0],
    });
    if (role === Roles.platform_admin) {
      user.globalRole = "platform_admin";
      user.role = "platform_admin";
      userStore.insert({ ...user });
    } else if (role === Roles.content_worker) {
      user.globalRole = "content_worker";
      user.role = "content_worker";
      userStore.insert({ ...user });
    }
    const orgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: `${email} Org`,
        slug: `org-${user.id}`,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgId,
        userId: user.id as UserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
    const session = await sessionService.createSession(user.id);
    return { token: session.sessionToken, userId: user.id, orgId };
  }

  function authHeaders(token: string) {
    return {
      "Content-Type": "application/json",
      Cookie: `avana_session=${token}`,
    };
  }

  beforeEach(async () => {
    config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionService = new SessionService(sessionStore, config.session);

    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const gateway = new MockModelGateway();
    generationQueue = new InMemoryGenerationQueue();

    courseStore = new InMemoryCourseStore(orgStore);
    coursePublicationStore = new InMemoryCoursePublicationStore();
    courseStore.setPublicationStore(coursePublicationStore);

    contentPackStore = new InMemoryContentPackStore(userStore);
    contentPackUsageStore = new InMemoryContentPackUsageStore();

    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    notificationStore = new InMemoryNotificationStore();
    const notificationService = new NotificationService(notificationStore);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      gateway,
      queue: generationQueue,
      courseStore,
      coursePublicationStore,
      contentPackStore,
      contentPackUsageStore,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      notificationService,
    });
    await app.ready();

    // Setup creator, learner, and platform admin
    const creator = await createAuthenticatedUser("creator@example.com", Roles.authenticated);
    creatorToken = creator.token;
    creatorUserId = creator.userId;
    creatorOrgId = creator.orgId;

    const learner = await createAuthenticatedUser("learner@example.com", Roles.authenticated);
    learnerToken = learner.token;
    learnerUserId = learner.userId;
    learnerOrgId = learner.orgId;

    const admin = await createAuthenticatedUser("admin@avana.test", Roles.platform_admin);
    adminToken = admin.token;
    adminUserId = admin.userId;
    adminOrgId = admin.orgId;
  });

  // Helper to publish a user-created course in stores
  async function createAndPublishUserCourse(title: string, subject = "داروسازی") {
    const now = new Date().toISOString();
    const courseId = asCourseId(randomUUID());
    const course = await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: title,
        subject,
        description: `توضیحات دوره ${title}`,
        isOfficial: false,
        status: "published",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const pubId = asCoursePublicationId(randomUUID());
    await coursePublicationStore.create({
      id: pubId,
      courseId: course.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: adminUserId,
      version: 1,
      status: "published",
      publishedAt: now,
      reviewedAt: now,
      title: course.name,
      description: course.description ?? "",
      subject: course.subject ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { courseId: course.id, publicationId: pubId };
  }

  test("1. Official platform courses behavior is completely preserved", async () => {
    const systemOrgId = (config.systemOrganizationId ?? "b4a0b464-16db-4087-92b7-163a1e6f6776") as OrganizationId;
    const officialCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: systemOrgId,
        name: "دوره رسمی پلتفرم آوانا",
        subject: "پزشکی عمومی",
        description: "دوره رسمی استاندارد آوانا",
        isOfficial: true,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 1. Learner sees official course in organization catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    expect(catRes.statusCode).toBe(200);
    const catItems = JSON.parse(catRes.body).items;
    expect(catItems.some((c: any) => c.id === officialCourse.id)).toBe(true);

    // 2. Learner adds official course to My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: officialCourse.id },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // 3. Learner's My Courses contains official course
    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    expect(myRes.statusCode).toBe(200);
    expect(JSON.parse(myRes.body).items.some((c: any) => c.id === officialCourse.id)).toBe(true);
  });

  test("2. User-created approved course is displayed in public library resources", async () => {
    const { courseId } = await createAndPublishUserCourse("فیزیولوژی عمومی کاربرساخته");

    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const body = JSON.parse(libRes.body);
    const found = body.courses.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("فیزیولوژی عمومی کاربرساخته");
  });

  test("3. User-created approved course is displayed in course selector for other organizations", async () => {
    const { courseId } = await createAndPublishUserCourse("فارماکولوژی قلب و عروق");

    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    expect(catRes.statusCode).toBe(200);
    const items = JSON.parse(catRes.body).items;
    const found = items.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("فارماکولوژی قلب و عروق");
  });

  test("4. Learner in another organization can successfully add approved user course to My Courses", async () => {
    const { courseId } = await createAndPublishUserCourse("شیمی دارویی پیشرفته");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);
    const body = JSON.parse(addRes.body);
    expect(body.success).toBe(true);
  });

  test("5. Enrolled user-created course is listed in GET /courses/my for the learner", async () => {
    const { courseId } = await createAndPublishUserCourse("ایمونولوژی پایه");

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    expect(myRes.statusCode).toBe(200);
    const items = JSON.parse(myRes.body).items;
    const found = items.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("ایمونولوژی پایه");
  });

  test("6. Adding user course to My Courses is idempotent and does not duplicate or crash", async () => {
    const { courseId } = await createAndPublishUserCourse("میکروبیولوژی پزشکی");

    // First add
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(res1.statusCode);

    // Second add (idempotent)
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(res2.statusCode);

    // Verify exactly 1 entry in list
    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    const items = JSON.parse(myRes.body).items.filter((c: any) => c.id === courseId);
    expect(items.length).toBe(1);
  });

  test("7. Unapproved courses (draft, pending_review, rejected) are strictly isolated and return 404/cannot be added", async () => {
    const now = new Date().toISOString();

    // 1. Draft course
    const draftCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره پیش‌نویس محرمانه",
        subject: "داروسازی",
        description: "پیش نویس",
        isOfficial: false,
        status: "draft",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Pending review course
    const pendingCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره در انتظار بررسی",
        subject: "داروسازی",
        description: "در انتظار بررسی",
        isOfficial: false,
        status: "pending_review",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: pendingCourse.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: null,
      version: 1,
      status: "pending_review",
      publishedAt: null,
      reviewedAt: null,
      title: pendingCourse.name,
      description: pendingCourse.description ?? "",
      subject: pendingCourse.subject ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. Rejected course
    const rejCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره رد شده",
        subject: "داروسازی",
        description: "رد شده",
        isOfficial: false,
        status: "draft",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: rejCourse.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: adminUserId,
      version: 1,
      status: "rejected",
      publishedAt: null,
      reviewedAt: now,
      title: rejCourse.name,
      description: rejCourse.description ?? "",
      subject: rejCourse.subject ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Verify none of them appear in learner's catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    const catIds = JSON.parse(catRes.body).items.map((c: any) => c.id);
    expect(catIds).not.toContain(draftCourse.id);
    expect(catIds).not.toContain(pendingCourse.id);
    expect(catIds).not.toContain(rejCourse.id);

    // Verify none of them appear in public library
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libIds = JSON.parse(libRes.body).courses.map((c: any) => c.id);
    expect(libIds).not.toContain(draftCourse.id);
    expect(libIds).not.toContain(pendingCourse.id);
    expect(libIds).not.toContain(rejCourse.id);

    // Verify attempting to add any of them to learner's My Courses fails with 404
    for (const cid of [draftCourse.id, pendingCourse.id, rejCourse.id]) {
      const addRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${learnerOrgId}/courses/my`,
        headers: authHeaders(learnerToken),
        payload: { course_id: cid },
      });
      expect(addRes.statusCode).toBe(404);
    }
  });

  test("8. Access control: other users who enrolled in public course CANNOT mutate or delete the course", async () => {
    const { courseId } = await createAndPublishUserCourse("سم‌شناسی بالینی");

    // Learner adds course
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    // Learner attempts to modify the course -> blocked (400, 403, or 404)
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}`,
      headers: authHeaders(learnerToken),
      payload: { title: "تغییر غیرمجاز عنوان دوره" },
    });
    expect([400, 403, 404]).toContain(updateRes.statusCode);

    // Learner attempts to delete the main course -> blocked (400, 403, or 404)
    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect([400, 403, 404]).toContain(delRes.statusCode);

    // Learner can remove it from their OWN My Courses list without affecting the course
    const removeRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${learnerOrgId}/courses/my/${courseId}`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(removeRes.statusCode).toBe(204);

    // Course still exists in store
    const course = await courseStore.findById(asCourseId(courseId));
    expect(course).toBeDefined();
    expect(course?.deletedAt).toBeNull();
  });

  test("9. Commercial rules preserved: paid course requires entitlement to view lessons", async () => {
    const { courseId, publicationId } = await createAndPublishUserCourse("بیوشیمی بالینی پیشرفته (پولی)");

    // Attach paid commerce product
    const prodId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: prodId,
      code: `course_pub_${publicationId}`,
      type: "course",
      title: "بیوشیمی بالینی پیشرفته (پولی)",
      description: "دوره پولی",
      price: 50000,
      currency: "toman",
      targetType: "course_publication",
      targetId: publicationId,
      durationDays: null,
      active: true,
      metadata: { coursePublicationId: publicationId, courseId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Learner adds course to My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // In library, the course is marked as paid with price 50000
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libCourse = JSON.parse(libRes.body).courses.find((c: any) => c.id === courseId);
    expect(libCourse).toBeDefined();
    expect(libCourse.purchase).toBeDefined();
    expect(libCourse.purchase.price).toBe(50000);
    expect(libCourse.access.hasAccess).toBe(false);
  });

  test("10. Privacy preserved: no creator private info (email/userId) in course responses", async () => {
    const { courseId } = await createAndPublishUserCourse("اصول فیزیوتراپی");

    // Catalog response
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    const item = JSON.parse(catRes.body).items.find((c: any) => c.id === courseId);
    expect(item).toBeDefined();
    expect(item.creatorEmail).toBeUndefined();
    expect(item.email).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain("creator@example.com");

    // Library response
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libItem = JSON.parse(libRes.body).courses.find((c: any) => c.id === courseId);
    expect(libItem).toBeDefined();
    expect(JSON.stringify(libItem)).not.toContain("creator@example.com");
  });

  test("11. Adding approved course to My Courses does not trigger AI generation or Gemini jobs", async () => {
    const queueSpy = { enqueueCount: 0 };
    const originalEnqueue = generationQueue.enqueueGenerationJob.bind(generationQueue);
    generationQueue.enqueueGenerationJob = async (input: any) => {
      queueSpy.enqueueCount++;
      return originalEnqueue(input);
    };

    const { courseId } = await createAndPublishUserCourse("آناتومی اندام فوقانی");

    const countBefore = queueSpy.enqueueCount;

    // Learner adds course
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // AI generation queue was NOT touched
    expect(queueSpy.enqueueCount).toBe(countBefore);
  });

  test("12. Own-organization courses work seamlessly without public publishing", async () => {
    // Creator creates a personal course in their own org
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: authHeaders(creatorToken),
      payload: {
        title: "دوره شخصی خودم (بدون انتشار)",
        subject: "یادداشت شخصی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const ownCourseId = JSON.parse(createRes.body).course.id;

    // Visible in creator's own catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: authHeaders(creatorToken),
    });
    expect(JSON.parse(catRes.body).items.some((c: any) => c.id === ownCourseId)).toBe(true);

    // Creator can add it to their My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/my`,
      headers: authHeaders(creatorToken),
      payload: { course_id: ownCourseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // Creator can edit their own course
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${creatorOrgId}/courses/${ownCourseId}`,
      headers: authHeaders(creatorToken),
      payload: { title: "عنوان ویرایش شده دوره شخصی" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).course.title).toBe("عنوان ویرایش شده دوره شخصی");
  });
});
