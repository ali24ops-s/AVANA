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
  asDocumentId,
  asGeneratedContentId,
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
import type { StorageProvider } from "../modules/documents/index.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryCourseStore,
  InMemoryCoursePublicationStore,
} from "../modules/courses/test/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

class FakeStorageProvider implements StorageProvider {
  async createUpload(options: { storageKey: string; mimeType: string }) {
    return {
      storageKey: options.storageKey,
      uploadUrl: "https://storage.test/upload",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
  async save(): Promise<void> {}
  async read(): Promise<Buffer> { return Buffer.from("test"); }
  async delete(): Promise<void> {}
  async exists(): Promise<boolean> { return true; }
  async getUrl(): Promise<string> { return "https://storage.test/file"; }
}

describe("Official Course Content Access & Generation Isolation", () => {
  let app: any;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let courseStore: InMemoryCourseStore;
  let coursePublicationStore: InMemoryCoursePublicationStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;
  let storageProvider: FakeStorageProvider;

  const systemOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  let studentToken: string;
  let studentUserId: UserId;
  let studentOrgId: OrganizationId;

  let adminToken: string;
  let adminUserId: UserId;

  let officialCourseId: ReturnType<typeof asCourseId>;
  let personalCourseId: ReturnType<typeof asCourseId>;
  let officialDocumentId: ReturnType<typeof asDocumentId>;
  let personalDocumentId: ReturnType<typeof asDocumentId>;

  async function createAuthenticatedUser(email: string, role: Role, orgId?: OrganizationId) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "secure_pass_hash_123",
      name: email.split("@")[0],
    });
    if (role === Roles.platform_admin) {
      user.globalRole = "platform_admin";
      user.role = "platform_admin";
      userStore.insert({ ...user });
    }
    const targetOrgId = orgId || (randomUUID() as OrganizationId);
    await orgStore.createWithAdminMembership({
      organization: {
        id: targetOrgId,
        name: `${email} Org`,
        slug: `org-${user.id}`,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: targetOrgId,
        userId: user.id as UserId,
        role: role === Roles.platform_admin ? "organization_admin" : "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
    const session = await sessionService.createSession(user.id);
    return { token: session.sessionToken, userId: user.id, orgId: targetOrgId };
  }

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = systemOrgId;

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
    const queue = new InMemoryGenerationQueue();
    storageProvider = new FakeStorageProvider();

    courseStore = new InMemoryCourseStore(orgStore);
    coursePublicationStore = new InMemoryCoursePublicationStore();
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
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      gateway,
      queue,
      courseStore,
      coursePublicationStore,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      notificationService,
    });
    await app.ready();

    // Create Admin in System Org
    const admin = await createAuthenticatedUser("admin@avana.ir", Roles.platform_admin, systemOrgId);
    adminToken = admin.token;
    adminUserId = admin.userId;

    // Create Student
    const student = await createAuthenticatedUser("learner@example.com", Roles.student);
    studentToken = student.token;
    studentUserId = student.userId;
    studentOrgId = student.orgId;

    // Create Official Course in System Org
    officialCourseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: systemOrgId,
        name: "دوره رسمی فیزیولوژی قلب",
        subject: "پزشکی",
        description: "دوره رسمی آوانا",
        isOfficial: true,
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Add student to official course as learner
    await courseStore.addUserCourse(studentUserId, officialCourseId);

    // Create Personal Course for Student
    personalCourseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: personalCourseId,
        organizationId: studentOrgId,
        name: "دوره شخصی من",
        subject: "عمومی",
        description: "دوره شخصی",
        isOfficial: false,
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Seed official and personal document
    officialDocumentId = asDocumentId(randomUUID());
    await documentStore.insert({
      id: officialDocumentId,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      ownerUserId: adminUserId,
      originalName: "official_notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 100,
      sha256: "hash_official",
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    personalDocumentId = asDocumentId(randomUUID());
    await documentStore.insert({
      id: personalDocumentId,
      organizationId: studentOrgId,
      courseId: personalCourseId,
      ownerUserId: studentUserId,
      originalName: "my_notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 50,
      sha256: "hash_personal",
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  test("Student cannot create upload intent for an official course", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${studentOrgId}/documents/upload-intent`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        "content-type": "application/json",
      },
      payload: {
        original_name: "unauthorized.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024 * 20,
        course_id: officialCourseId,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("دوره‌های رسمی آوانا مجاز نیست");
  });

  test("Student CAN create upload intent for their personal course", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${studentOrgId}/documents/upload-intent`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        "content-type": "application/json",
      },
      payload: {
        original_name: "valid.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024 * 20,
        course_id: personalCourseId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.upload_url).toBeDefined();
    expect(body.document_id).toBeDefined();
  });

  test("Student cannot generate content on an official course", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${studentOrgId}/courses/${officialCourseId}/documents/${personalDocumentId}/generate`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        "content-type": "application/json",
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("دوره‌های رسمی آوانا وجود ندارد");
  });

  test("Student cannot estimate generation cost on an official course", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${studentOrgId}/courses/${officialCourseId}/documents/${personalDocumentId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        "content-type": "application/json",
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("دوره‌های رسمی آوانا وجود ندارد");
  });

  test("Student cannot access review queue on an official course", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${studentOrgId}/courses/${officialCourseId}/generated/review-queue`,
      headers: {
        authorization: `Bearer ${studentToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("صف بررسی دوره‌های رسمی آوانا مجاز نیست");
  });

  test("Student cannot mutate review items on an official course", async () => {
    const officialContentId = asGeneratedContentId(randomUUID());
    await generatedContentStore.create({
      id: officialContentId,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      documentId: officialDocumentId,
      type: "lesson",
      status: "draft",
      payload: { title: "درس رسمی" },
      model: "test-model",
      promptTokens: 100,
      completionTokens: 200,
      generationDurationMs: 500,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${systemOrgId}/courses/${officialCourseId}/generated/${officialContentId}/accept`,
      headers: {
        authorization: `Bearer ${studentToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  test("Platform Admin CAN access review queue and manage official course content", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${systemOrgId}/courses/${officialCourseId}/generated/review-queue`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.pending).toBeDefined();
  });

  test("Student CAN view and study official course lessons via getCourseLearning", async () => {
    // Seed module and lesson in official course with deletedAt: null and publicationStatus: "published"
    const modId = randomUUID();
    await moduleStore.create({
      id: modId as any,
      courseId: officialCourseId,
      title: "فصل اول فیزیولوژی",
      description: "مقدمات",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await lessonStore.create({
      id: randomUUID() as any,
      courseId: officialCourseId,
      moduleId: modId as any,
      title: "درس مقدماتی",
      sortOrder: 1,
      contentType: "markdown",
      contentMarkdown: "# متن درس رسمی",
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${officialCourseId}/learn`,
      headers: {
        authorization: `Bearer ${studentToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.course?.id).toBe(officialCourseId);
    expect(body.course?.isOfficial).toBe(true);
    expect(body.modules?.length).toBe(1);
    expect(body.modules[0].lessons?.length).toBe(1);
    expect(body.modules[0].lessons[0].title).toBe("درس مقدماتی");
  });
});
