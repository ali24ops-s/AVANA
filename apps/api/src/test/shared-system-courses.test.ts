import { describe, it, expect, beforeEach, afterEach } from "vitest";
import promisesFs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
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
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { createModelGateway } from "../modules/generation/gateway/index.js";
import type { CourseId, DocumentId, OrganizationId } from "@avana/domain";

function makeTestConfig() {
  const base = loadApiConfig({
    NODE_ENV: "test",
    SYSTEM_ORGANIZATION_ID: "b4a0b464-16db-4087-92b7-163a1e6f6776",
  });
  return {
    ...base,
    logging: { redactHeaders: [], level: "silent" },
  };
}

const SYSTEM_ORG_ID = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
const SYSTEM_COURSE_ID = "5a767d70-a58b-469b-b6f0-2192ffe92ce7" as CourseId;

describe("Shared System Courses Integration Tests", () => {
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
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    storageDir = await promisesFs.mkdtemp(path.join(os.tmpdir(), "avana-system-course-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    // Seed system course under SYSTEM_ORG_ID
    await courseStore.create({
      course: {
        id: SYSTEM_COURSE_ID,
        organizationId: SYSTEM_ORG_ID,
        name: "فارماکولوژی ۱",
        subject: "فارماکولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
  });

  afterEach(async () => {
    await promisesFs.rm(storageDir, { recursive: true, force: true });
  });

  async function buildApp() {
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
      auditService,
    });
    return app;
  }

  async function registerAndLogin(_app: Awaited<ReturnType<typeof buildApp>>, email: string) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "hash",
      name: "New Student",
    });
    const sessionService = new SessionService(sessionStore, config.session);
    const session = await sessionService.createSession(user.id);
    const userOrgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: userOrgId,
        name: `فضای یادگیری ${user.name}`,
        slug: `org-slug-${randomUUID()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: userOrgId,
        userId: user.id,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    return { token: session.sessionToken, userOrgId, userId: user.id };
  }

  it("Scenario 1: New user sees shared system courses", async () => {
    const app = await buildApp();
    const { token, userOrgId } = await registerAndLogin(app, "newstudent1@example.com");

    const coursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userOrgId}/courses`,
      cookies: { avana_session: token },
    });

    expect(coursesRes.statusCode).toBe(200);
    const body = JSON.parse(coursesRes.body) as { items: Array<{ id: string; title: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.some((c) => c.id === SYSTEM_COURSE_ID)).toBe(true);

    await app.close();
  });

  it("Scenario 3 & 4: Generation with valid courseId succeeds (202), invalid courseId returns 400", async () => {
    const app = await buildApp();
    const { token, userOrgId, userId } = await registerAndLogin(app, "newstudent2@example.com");

    const docId = "00000000-0000-4000-8000-000000000001" as DocumentId;
    await documentStore.create({
      id: docId,
      organizationId: userOrgId,
      courseId: SYSTEM_COURSE_ID,
      ownerUserId: userId,
      originalName: "lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "hash",
      storageKey: "storage-key-1",
      pageCount: 10,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Trigger generation with valid System Course ID -> 202 Accepted
    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${userOrgId}/courses/${SYSTEM_COURSE_ID}/documents/${docId}/generate`,
      cookies: { avana_session: token },
      payload: {},
    });

    expect(genRes.statusCode).toBe(202);
    const genBody = JSON.parse(genRes.body) as { job_id: string; status: string };
    expect(genBody.status).toBe("queued");
    expect(genBody.job_id).toBeTruthy();

    // Trigger generation with invalid courseId (non-UUID) -> 400 Bad Request
    const invalidRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${userOrgId}/courses/invalid-uuid/documents/${docId}/generate`,
      cookies: { avana_session: token },
      payload: {},
    });
    expect(invalidRes.statusCode).toBe(400);

    await app.close();
  });

  it("Scenario 5 & 6: Non-existent courseId returns 404, 3rd party private course returns 403", async () => {
    const app = await buildApp();
    const user1 = await registerAndLogin(app, "user1@example.com");
    const user2 = await registerAndLogin(app, "user2@example.com");

    // Create a private course under user2's org
    const privateCourseId = "99999999-9999-4999-8999-999999999999" as CourseId;
    await courseStore.create({
      course: {
        id: privateCourseId,
        organizationId: user2.userOrgId,
        name: "User2 Secret Course",
        subject: "Private",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const docId = "00000000-0000-4000-8000-000000000002" as DocumentId;
    await documentStore.create({
      id: docId,
      organizationId: user1.userOrgId,
      courseId: SYSTEM_COURSE_ID,
      ownerUserId: user1.userId,
      originalName: "doc1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 500,
      sha256: "hash2",
      storageKey: "storage-key-2",
      pageCount: 5,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Non-existent courseId -> 404
    const nonExistentRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${user1.userOrgId}/courses/00000000-0000-4000-8000-000000000000/documents/${docId}/generate`,
      cookies: { avana_session: user1.token },
      payload: {},
    });
    expect(nonExistentRes.statusCode).toBe(404);

    // Private course belonging to User 2 -> 403 Forbidden
    const privateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${user1.userOrgId}/courses/${privateCourseId}/documents/${docId}/generate`,
      cookies: { avana_session: user1.token },
      payload: {},
    });
    expect(privateRes.statusCode).toBe(403);

    await app.close();
  });

  it("Scenario 7 & 8: GET /v1/courses/:courseId/learn returns 200 (modules: []) for System Course, and 404 for User 2's Private Course", async () => {
    const app = await buildApp();
    const user1 = await registerAndLogin(app, "learner1@example.com");
    const user2 = await registerAndLogin(app, "learner2@example.com");

    // 1. System Course has zero modules in test setup
    const systemLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${SYSTEM_COURSE_ID}/learn`,
      cookies: { avana_session: user1.token },
    });

    expect(systemLearnRes.statusCode).toBe(200);
    const systemBody = JSON.parse(systemLearnRes.body) as {
      course: { id: string };
      modules: unknown[];
    };
    expect(systemBody.course.id).toBe(SYSTEM_COURSE_ID);
    expect(systemBody.modules.length).toBe(0);

    // 2. Create private course under User 2's org
    const user2PrivateCourseId = "88888888-8888-4888-8888-888888888888" as CourseId;
    await courseStore.create({
      course: {
        id: user2PrivateCourseId,
        organizationId: user2.userOrgId,
        name: "User2 Secret Learning Course",
        subject: "Secret",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // User 1 attempts GET /learn on User 2's private course -> 404 Not Found
    const privateLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${user2PrivateCourseId}/learn`,
      cookies: { avana_session: user1.token },
    });

    expect(privateLearnRes.statusCode).toBe(404);

    await app.close();
  });
});
