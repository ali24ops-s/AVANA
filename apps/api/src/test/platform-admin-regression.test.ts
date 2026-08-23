/**
 * Regression test suite for platform_admin role and authorization policy.
 *
 * Verifies:
 * 1. platform_admin can access course:read, document:read, and Admin operations.
 * 2. student can access course:read and document:read, but is denied Admin operations.
 * 3. teacher non-admin boundaries remain intact.
 */

import { describe, expect, it, beforeEach } from "vitest";
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
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { Roles } from "@avana/domain";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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

describe("Platform Admin Authorization Regression Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let adminStore: InMemoryAdminStore;
  let tempDir: string;
  let storage: LocalStorageProvider;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    courseStore = new InMemoryCourseStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    adminStore = new (class extends InMemoryAdminStore {
      async getDocument(id: string) {
        const doc = documentStore.getAll().find(d => d.id === id);
        if (!doc) return null;
        return {
          id: doc.id,
          organizationId: doc.organizationId,
          status: doc.status,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt,
        } as any;
      }
    })();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-test-reg-"));
    storage = new LocalStorageProvider(tempDir);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      documentStore,
      documentChunkStore: chunkStore,
      storageProvider: storage,
      auditService,
      adminStore,
    });
    return app;
  }

  async function createAuthenticatedUser(
    app: any,
    email: string,
    role: "student" | "teacher" | "platform_admin",
  ) {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "Password123!" },
    });
    const token = extractSessionToken(regRes);
    const user = (regRes.json() as any).user;

    // Set role in user store
    const userRec = (userStore as any).users.get(user.id);
    if (userRec) {
      userRec.role = role;
    }

    return { token: token!, userId: user.id };
  }

  it("allows platform_admin to access course:read, document:read, and Admin operations without forbidden errors", async () => {
    const app = await buildApp();

    // 1. Create org and course using an initial setup
    const { token: adminToken, userId: adminId } =
      await createAuthenticatedUser(app, "admin@avana.test", "platform_admin");

    // Create an organization
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: adminToken },
      payload: { name: "Test Org" },
    });
    expect(orgRes.statusCode).toBe(201);
    const org = (orgRes.json() as any).organization;

    // Update org membership to platform_admin
    const membership = await orgStore.findMembership(org.id, adminId);
    if (membership) {
      membership.role = Roles.platform_admin;
    }

    // Create course
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: adminToken },
      payload: { title: "Pharmacology 101", subject: "Pharma", exam_at: null },
    });
    expect(courseRes.statusCode).toBe(201);
    const course = (courseRes.json() as any).course;

    // --- SCENARIO 1: course:read for platform_admin ---
    const listCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: adminToken },
    });
    expect(listCoursesRes.statusCode).toBe(200);
    const coursesList = (listCoursesRes.json() as any).items;
    expect(coursesList).toHaveLength(1);
    expect(coursesList[0].id).toBe(course.id);

    const getCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: adminToken },
    });
    expect(getCourseRes.statusCode).toBe(200);
    expect((getCourseRes.json() as any).course.id).toBe(course.id);

    // --- SCENARIO 2: document:read for platform_admin ---
    const listDocsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/documents`,
      cookies: { avana_session: adminToken },
    });
    expect(listDocsRes.statusCode).toBe(200);
    expect((listDocsRes.json() as any).items).toBeDefined();

    // --- SCENARIO 3: Admin operations for platform_admin ---
    const adminDashboardRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: adminToken },
    });
    expect(adminDashboardRes.statusCode).toBe(200);

    const adminUsersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: adminToken },
    });
    expect(adminUsersRes.statusCode).toBe(200);

    await app.close();
  });

  it("allows student course:read and document:read, but strictly denies student from admin operations", async () => {
    const app = await buildApp();

    const { token: studentToken } =
      await createAuthenticatedUser(app, "student@avana.test", "student");

    // Student creates org
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: studentToken },
      payload: { name: "Student Org" },
    });
    expect(orgRes.statusCode).toBe(201);
    const org = (orgRes.json() as any).organization;

    // Course:read => ALLOW
    const coursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: studentToken },
    });
    expect(coursesRes.statusCode).toBe(200);

    // Document:read => ALLOW
    const docsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/documents`,
      cookies: { avana_session: studentToken },
    });
    expect(docsRes.statusCode).toBe(200);

    // Admin dashboard => DENY (403)
    const adminDashboardRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: studentToken },
    });
    expect(adminDashboardRes.statusCode).toBe(403);

    // Admin users => DENY (403)
    const adminUsersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: studentToken },
    });
    expect(adminUsersRes.statusCode).toBe(403);

    await app.close();
  });

  it("preserves teacher boundaries and denies teacher from admin operations", async () => {
    const app = await buildApp();

    const { token: teacherToken } =
      await createAuthenticatedUser(app, "teacher@avana.test", "teacher");

    // Admin dashboard => DENY (403)
    const adminDashboardRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: teacherToken },
    });
    expect(adminDashboardRes.statusCode).toBe(403);

    await app.close();
  });

  it("platform_admin can download and delete documents without org membership", async () => {
    const app = await buildApp();

    const { token: adminToken } = await createAuthenticatedUser(app, "admin@avana.test", "platform_admin");
    const { token: studentToken } = await createAuthenticatedUser(app, "student@avana.test", "student");

    // Student creates org so admin is NOT a member
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: studentToken },
      payload: { name: "Student Org" },
    });
    const org = (orgRes.json() as any).organization;

    // Student uploads document
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/documents/upload-intent`,
      cookies: { avana_session: studentToken },
      payload: { original_name: "test.txt", mime_type: "text/plain", size_bytes: 100 },
    });

    const boundary = "------------------------testboundary";
    const body = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="test.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `test content\r\n` +
      `--${boundary}--\r\n`
    );

    const createDocRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/documents`,
      cookies: { avana_session: studentToken },
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    
    const doc = createDocRes.json() as any;
    const docId = doc.document?.id || doc.id;

    // 1. Platform Admin Download -> 200
    const downloadRes = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}/download`,
      cookies: { avana_session: adminToken },
    });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers["content-disposition"]).toContain("test.txt");

    // 3. Student Admin Download -> 403
    const studentDownloadRes = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}/download`,
      cookies: { avana_session: studentToken },
    });
    expect(studentDownloadRes.statusCode).toBe(403);

    // 4. Student Admin Delete -> 403
    const studentDeleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/documents/${docId}`,
      cookies: { avana_session: studentToken },
    });
    expect(studentDeleteRes.statusCode).toBe(403);

    // 2. Platform Admin Delete -> 204
    const adminDeleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/documents/${docId}`,
      cookies: { avana_session: adminToken },
    });
    expect(adminDeleteRes.statusCode).toBe(204);

    // 5. Deleted document Admin Download -> 404
    const notFoundDownload = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}/download`,
      cookies: { avana_session: adminToken },
    });
    expect(notFoundDownload.statusCode).toBe(404);

    // 6. Non-existent document -> 404
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const nonExistentDownload = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${nonExistentId}/download`,
      cookies: { avana_session: adminToken },
    });
    expect(nonExistentDownload.statusCode).toBe(404);

    // 7. Storage file missing but DB record present -> 404
    // Restore the document in DB for testing
    const docRecord = documentStore.getAll().find(d => d.id === docId);
    if (docRecord) {
      docRecord.deletedAt = null; // Un-delete
    }
    // Storage is already deleted by adminDeleteRes
    const missingStorageDownload = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}/download`,
      cookies: { avana_session: adminToken },
    });
    expect(missingStorageDownload.statusCode).toBe(404);

    await app.close();
  });
});
