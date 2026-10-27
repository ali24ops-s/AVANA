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
  InMemoryGenerationChunkStore,
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

describe("POST review-summary Official Course & Tenant Permissions", () => {
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
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;
  let storageProvider: FakeStorageProvider;

  const systemOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  let studentToken: string;
  let studentOrgId: OrganizationId;

  let adminToken: string;
  let adminOrgId: OrganizationId;

  let officialCourseId: ReturnType<typeof asCourseId>;
  let officialDocumentId: ReturnType<typeof asDocumentId>;

  let personalCourseId: ReturnType<typeof asCourseId>;
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
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const generationChunkStore = new InMemoryGenerationChunkStore();
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
      generationChunkStore,
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
      systemOrganizationId: systemOrgId,
    });
    await app.ready();

    // 1. Admin user with their personal org
    adminOrgId = randomUUID() as OrganizationId;
    const admin = await createAuthenticatedUser("admin@avana.ir", Roles.platform_admin, adminOrgId);
    adminToken = admin.token;

    // Seed systemOrgId in orgStore
    await orgStore.createWithAdminMembership({
      organization: {
        id: systemOrgId,
        name: "سازمان رسمی سیستم",
        slug: "org-system",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: systemOrgId,
        userId: admin.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Student user
    const student = await createAuthenticatedUser("learner@example.com", Roles.student);
    studentToken = student.token;
    studentOrgId = student.orgId;

    // 3. Official Course in systemOrgId
    officialCourseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: systemOrgId,
        name: "شیمی دارویی رسمی",
        subject: "پزشکی",
        description: "دوره رسمی سیستم",
        isOfficial: true,
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 4. Document in systemOrgId connected to official course
    officialDocumentId = asDocumentId(randomUUID());
    await documentStore.create({
      id: officialDocumentId,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      title: "cardio-official.pdf",
      mimeType: "application/pdf",
      storageKey: `docs/${officialDocumentId}.pdf`,
      status: "ready",
      sizeBytes: 1024,
      chunkCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const officialChunkId = randomUUID() as any;
    await documentChunkStore.createMany([
      {
        id: officialChunkId,
        documentId: officialDocumentId,
        organizationId: systemOrgId,
        chunkIndex: 0,
        content: "مفاهیم کلیدی شیمی دارویی و نکات فارماکولوژی",
        tokenEstimate: 50,
      },
    ]);

    // Upstream lesson draft required by Stage 5 review summary
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      documentId: officialDocumentId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        moduleTitle: "درسنامه شیمی دارویی",
        outline: [{ title: "مقدمه", description: "معرفی داروها" }],
        sessions: [
          {
            title: "جلسه اول",
            contentMarkdown: "محتوای جلسه اول",
            citationChunkIds: [officialChunkId],
          },
        ],
        citationChunkIds: [officialChunkId],
        coverageReport: {
          coverageRatio: 1.0,
          sourceTopicsIdentified: [{ title: "مقدمه", coveredInSessionIndex: 0 }],
        },
      },
      model: "mock-model",
      promptTokens: 100,
      completionTokens: 200,
      generationDurationMs: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 5. Personal course in studentOrgId
    personalCourseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: personalCourseId,
        organizationId: studentOrgId,
        name: "دوره خصوصی دانشجو",
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

    // 6. Personal document in studentOrgId
    personalDocumentId = asDocumentId(randomUUID());
    await documentStore.create({
      id: personalDocumentId,
      organizationId: studentOrgId,
      courseId: personalCourseId,
      title: "student-notes.pdf",
      mimeType: "application/pdf",
      storageKey: `docs/${personalDocumentId}.pdf`,
      status: "ready",
      sizeBytes: 1024,
      chunkCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  test("Platform admin can regenerate review summary on official course when URL organizationId is personal org", async () => {
    // Calling with admin's personal adminOrgId in URL for an official course
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${adminOrgId}/courses/${officialCourseId}/documents/${officialDocumentId}/review-summary`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        force: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.content).toBeDefined();
    expect(body.content.type).toBe("review_summary");
    // Verify saved under official course organization
    expect(body.content.organization_id).toBe(systemOrgId);
  });

  test("Regular student cannot regenerate review summary on official course (403 Forbidden)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${studentOrgId}/courses/${officialCourseId}/documents/${officialDocumentId}/review-summary`,
      headers: {
        authorization: `Bearer ${studentToken}`,
        "content-type": "application/json",
      },
      payload: {
        force: true,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("دوره‌های رسمی آوانا وجود ندارد");
  });

  test("Tenant isolation: cannot access course belonging to another non-official organization", async () => {
    const foreignOrgId = randomUUID() as OrganizationId;
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${foreignOrgId}/courses/${personalCourseId}/documents/${personalDocumentId}/review-summary`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        force: true,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("Access denied to this course");
  });

  test("Reject review summary generation when document belongs to another course", async () => {
    // Attempting to generate on personalDocumentId (linked to personalCourseId) under officialCourseId
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${adminOrgId}/courses/${officialCourseId}/documents/${personalDocumentId}/review-summary`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        force: true,
      },
    });

    // personalDocumentId is in studentOrgId, so finding it in systemOrgId yields 404
    expect([400, 404]).toContain(res.statusCode);
  });

  test("Reject review summary generation when document in the same org is assigned to another course", async () => {
    // Create another official course
    const anotherCourseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: anotherCourseId,
        organizationId: systemOrgId,
        name: "دوره دوم سیستم",
        subject: "پزشکی",
        description: "دوره رسمی دوم",
        isOfficial: true,
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Request with anotherCourseId but officialDocumentId (which is assigned to officialCourseId)
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${adminOrgId}/courses/${anotherCourseId}/documents/${officialDocumentId}/review-summary`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: {
        force: true,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toContain("این سند به دوره دیگری تعلق دارد.");
  });
});
