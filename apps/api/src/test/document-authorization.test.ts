/**
 * Phase 3 Document Read Authorization Test Suite.
 *
 * Tests the canonical document read endpoint:
 * GET /v1/organizations/:organizationId/documents/:documentId
 *
 * Uses REAL defaultPolicy.can without mocking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type CourseId,
  type DocumentId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{
    storageKey: string;
    uploadUrl: string | null;
    expiresAt: string;
  }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: {
    storageKey: string;
    data: Buffer;
    mimeType: string;
  }): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const buf = this.files.get(storageKey);
    if (!buf) throw new Error(`Not found: ${storageKey}`);
    return buf;
  }
}

describe("Phase 3: Document Read Authorization Suite", () => {
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let storageProvider: FakeStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const systemOrgId = "99999999-9999-9999-9999-999999999999" as OrganizationId;

  function makeConfig() {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";
    const cfg = loadApiConfig();
    cfg.systemOrganizationId = systemOrgId;
    return cfg;
  }

  async function buildTestApp(config = makeConfig()) {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      documentChunkStore,
      storageProvider,
      auditService,
    });
    return app;
  }

  beforeEach(() => {
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore();
    courseStore = new InMemoryCourseStore(orgStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    storageProvider = new FakeStorageProvider();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  let phoneCounter = 4000;
  async function signIn(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    email: string,
    globalRole?: Role | null,
  ) {
    phoneCounter++;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password123",
        firstName: "Test",
        lastName: "User",
        phoneNumber: `0912000${phoneCounter}`,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    const userId = body.user.id as UserId;
    if (globalRole) {
      const user = await userStore.findById(userId);
      if (user) {
        userStore.insert({
          ...user,
          globalRole,
          role: globalRole === "platform_admin" ? "platform_admin" : "student",
        });
      }
    }
    return {
      token: extractSessionToken(res)!,
      userId,
      email: body.user.email,
    };
  }

  async function seedOrgWithDocument(
    orgName: string,
    orgIdOverride?: OrganizationId,
    ownerUserId?: UserId,
  ) {
    const orgId = orgIdOverride ?? (randomUUID() as OrganizationId);
    const now = new Date().toISOString();

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: randomUUID() as UserId,
      role: "organization_admin",
      createdAt: now,
      updatedAt: now,
    });

    const documentId = randomUUID() as DocumentId;
    await documentStore.create({
      id: documentId,
      organizationId: orgId,
      courseId: null,
      ownerUserId: ownerUserId ?? (randomUUID() as UserId),
      originalName: `${orgName}_handbook.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "abc123456789",
      storageKey: `uploads/${documentId}.pdf`,
      pageCount: 5,
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { orgId, documentId };
  }

  // ---------------------------------------------------------------------------
  // 1. Allowed Read Roles
  // ---------------------------------------------------------------------------
  describe("Allowed Document Read Roles", () => {
    it("allows platform_admin to read document across any organization (200 OK)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token: adminToken } = await signIn(app, "admin@avana.test", Roles.platform_admin);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
      expect(json.document.original_name).toBe("Tenant Alpha_handbook.pdf");
      expect(json.document.organization_id).toBe(orgId);
    });

    it("allows organization_admin of target org to read document (200 OK)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "orgadmin@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
    });

    it("allows course_editor of target org to read document (200 OK)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "editor@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.course_editor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
    });

    it("allows teacher of target org to read document (200 OK)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "teacher@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.teacher,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
    });

    it("allows student of target org to read document (200 OK)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "student@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.student,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Denied Roles and Non-Members
  // ---------------------------------------------------------------------------
  describe("Denied Roles and Non-Members", () => {
    it("denies student with no membership in target org with non-disclosing 404", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token } = await signIn(app, "outsider@avana.test");

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.error.message).toBe("Document not found");
    });

    it("denies support_agent member in target org with 403 Forbidden", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "support@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.support_agent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error.message).toBe("Role does not permit reading this document");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Content Worker Behavior (System vs Tenant)
  // ---------------------------------------------------------------------------
  describe("Content Worker System vs Tenant Scoping", () => {
    it("allows content_worker to read official document in system org (200 OK)", async () => {
      const app = await buildTestApp();
      const { documentId } = await seedOrgWithDocument(
        "Official Org",
        systemOrgId,
      );
      const { token } = await signIn(app, "worker@avana.test", Roles.content_worker);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${systemOrgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.document.id).toBe(documentId);
    });

    it("denies content_worker on tenant document without tenant membership (404 Not Found)", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token } = await signIn(app, "worker@avana.test", Roles.content_worker);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it("allows content_worker with explicit tenant membership in Org B to read Org B document, but not Org A", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, documentId: docA } = await seedOrgWithDocument("Tenant Alpha");
      const { orgId: orgB, documentId: docB } = await seedOrgWithDocument("Tenant Beta");

      const { token, userId } = await signIn(app, "worker_beta@avana.test", Roles.content_worker);

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId,
        role: Roles.course_editor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Allowed in Org B
      const resB = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/documents/${docB}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(resB.statusCode).toBe(200);

      // Denied in Org A
      const resA = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgA}/documents/${docA}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(resA.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Org Users
  // ---------------------------------------------------------------------------
  describe("Multi-Org User Role Isolation", () => {
    it("evaluates user permissions strictly according to the target org membership", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, documentId: docA } = await seedOrgWithDocument("Tenant Alpha");
      const { orgId: orgB, documentId: docB } = await seedOrgWithDocument("Tenant Beta");

      const { token, userId } = await signIn(app, "multiorg@avana.test");

      // Student in Org A, Org Admin in Org B
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgA,
        userId,
        role: Roles.student,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Read Org A doc
      const resA = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgA}/documents/${docA}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(resA.statusCode).toBe(200);

      // Read Org B doc
      const resB = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/documents/${docB}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(resB.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Anti-Spoofing and IDOR Protections
  // ---------------------------------------------------------------------------
  describe("Anti-Spoofing, IDOR, and Missing Resources", () => {
    it("rejects request when organizationId in URL does not match document's authoritative organization (404)", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, documentId: docA } = await seedOrgWithDocument("Tenant Alpha");
      const { orgId: orgB } = await seedOrgWithDocument("Tenant Beta");

      const { token, userId } = await signIn(app, "user_both@avana.test");
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgA,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Tampered URL: docA requested under orgB
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/documents/${docA}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.error.message).toBe("Document not found");
    });

    it("returns 404 for non-existent document ID", async () => {
      const app = await buildTestApp();
      const { orgId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "admin_alpha@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fakeDocId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${fakeDocId}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for soft-deleted document", async () => {
      const app = await buildTestApp();
      const { orgId, documentId } = await seedOrgWithDocument("Tenant Alpha");
      const { token, userId } = await signIn(app, "admin_alpha@avana.test");

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Soft delete
      await documentStore.delete(documentId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/documents/${documentId}`,
        headers: { cookie: `avana_session=${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
