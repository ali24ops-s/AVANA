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
import { InMemoryAdminStore, type AdminDocumentRecord } from "../modules/admin/index.js";
import { Roles, defaultPolicy, type OrganizationId, type UserId, type Actor, DomainError } from "@avana/domain";
import { GenerationService } from "../modules/generation/index.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import { randomUUID } from "node:crypto";
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
        } as unknown as AdminDocumentRecord;
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

  let phoneCounter = 1000000;
  async function createAuthenticatedUser(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
    role: "student" | "teacher" | "platform_admin",
  ) {
    phoneCounter++;
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Password123!",
        firstName: "ادمین",
        lastName: "سیستم",
        phoneNumber: `0912${String(phoneCounter).padStart(7, "0")}`,
      },
    });
    const token = extractSessionToken(regRes);
    const user = (regRes.json() as { user: { id: string } }).user;

    // Set role in user store
    const userRec = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(user.id);
    if (userRec) {
      userRec.role = role;
      if (role === "platform_admin") {
        userRec.globalRole = "platform_admin";
        orgStore.clearMembershipsForUser(user.id as UserId);
      }
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
    const org = (orgRes.json() as { organization: { id: string } }).organization;

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
    const course = (courseRes.json() as { course: { id: string } }).course;

    // --- SCENARIO 1: course:read for platform_admin ---
    const listCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: adminToken },
    });
    expect(listCoursesRes.statusCode).toBe(200);
    const coursesList = (listCoursesRes.json() as { items: Array<{ id: string }> }).items;
    expect(coursesList).toHaveLength(1);
    expect(coursesList[0].id).toBe(course.id);

    const getCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: adminToken },
    });
    expect(getCourseRes.statusCode).toBe(200);
    expect((getCourseRes.json() as { course: { id: string } }).course.id).toBe(course.id);

    // --- SCENARIO 2: document:read for platform_admin ---
    const listDocsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/documents`,
      cookies: { avana_session: adminToken },
    });
    expect(listDocsRes.statusCode).toBe(200);
    expect((listDocsRes.json() as { items: unknown[] }).items).toBeDefined();

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
    const org = (orgRes.json() as { organization: { id: string } }).organization;

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
    const org = (orgRes.json() as { organization: { id: string } }).organization;

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
    
    const doc = createDocRes.json() as { document?: { id: string }; id?: string };
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

  describe("Admin vs Normal User Upload & Extraction Isolation Matrix", () => {
    it("Scenario A: platform_admin with ZERO memberships can upload to an existing organization", async () => {
      const app = await buildApp();
      const { token: adminToken, userId: adminUserId } =
        await createAuthenticatedUser(app, "admin-upload@avana.test", "platform_admin");

      // Verify admin has zero memberships
      const mems = await orgStore.listMembershipsByUserId(adminUserId);
      expect(mems).toHaveLength(0);

      // Create an organization (without admin membership)
      const existingOrgId = randomUUID() as OrganizationId;
      await orgStore.createWithAdminMembership({
        organization: {
          id: existingOrgId,
          name: "Target Tenant Org",
          slug: "target-tenant-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: randomUUID(),
          organizationId: existingOrgId,
          userId: randomUUID(),
          role: "organization_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      // Platform admin uploads document via multipart POST /v1/organizations/:orgId/documents
      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="admin-source.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `%PDF-1.4 sample content\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${existingOrgId}/documents`,
        cookies: { avana_session: adminToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(201);
      const json = uploadRes.json() as { document: { id: string; original_name: string; organization_id: string } };
      expect(json.document).toBeDefined();
      expect(json.document.original_name).toBe("admin-source.pdf");
      expect(json.document.organization_id).toBe(existingOrgId);

      await app.close();
    });

    it("Scenario B: platform_admin can trigger extraction on an uploaded document without membership", async () => {
      const app = await buildApp();
      const { token: adminToken } =
        await createAuthenticatedUser(app, "admin-extract@avana.test", "platform_admin");

      const existingOrgId = randomUUID() as OrganizationId;
      await orgStore.createWithAdminMembership({
        organization: {
          id: existingOrgId,
          name: "Extract Target Org",
          slug: "extract-target-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: randomUUID(),
          organizationId: existingOrgId,
          userId: randomUUID(),
          role: "organization_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="extract-test.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        `plain text extraction content\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${existingOrgId}/documents`,
        cookies: { avana_session: adminToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const docId = (uploadRes.json() as { document: { id: string } }).document.id;

      // Platform admin triggers extraction
      const extractRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${existingOrgId}/documents/${docId}/extract`,
        cookies: { avana_session: adminToken },
      });
      expect(extractRes.statusCode).toBe(200);
      const extractJson = extractRes.json() as { status: { document_id: string; status: string } };
      expect(extractJson.status.document_id).toBe(docId);
      expect(extractJson.status.status).toBe("extracted");

      await app.close();
    });

    it("Scenario C: platform_admin upload to a non-existent organization fails with 404", async () => {
      const app = await buildApp();
      const { token: adminToken } =
        await createAuthenticatedUser(app, "admin-404@avana.test", "platform_admin");

      const nonExistentOrgId = randomUUID();
      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="should-fail.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `dummy pdf content\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${nonExistentOrgId}/documents`,
        cookies: { avana_session: adminToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(404);
      const json = uploadRes.json() as { error: { code: string; message: string } };
      expect(json.error.message).toBe("Organization not found");

      await app.close();
    });

    it("Scenario D: normal student uploads to their own organization -> 201 Created", async () => {
      const app = await buildApp();
      const { token: studentToken } =
        await createAuthenticatedUser(app, "student-own@avana.test", "student");

      // Student creates org
      const orgRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: studentToken },
        payload: { name: "Student Own Org" },
      });
      expect(orgRes.statusCode).toBe(201);
      const orgId = (orgRes.json() as { organization: { id: string } }).organization.id;

      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="student-doc.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `student content\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents`,
        cookies: { avana_session: studentToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);

      await app.close();
    });

    it("Scenario E: normal student upload to another organization (no membership) -> 404 Organization not found", async () => {
      const app = await buildApp();
      const { token: student1Token } =
        await createAuthenticatedUser(app, "student1@avana.test", "student");
      const { token: student2Token } =
        await createAuthenticatedUser(app, "student2@avana.test", "student");

      // Student 1 creates Org 1
      const orgRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: student1Token },
        payload: { name: "Student 1 Org" },
      });
      const org1Id = (orgRes.json() as { organization: { id: string } }).organization.id;

      // Student 2 tries to upload to Student 1's Org
      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="intruder-file.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `intruder content\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org1Id}/documents`,
        cookies: { avana_session: student2Token },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(404);
      const errJson = uploadRes.json() as { error: { code: string; message: string } };
      expect(errJson.error.message).toBe("Organization not found");

      await app.close();
    });

    it("Scenario F: normal user with 0 memberships cannot upload -> 404 Organization not found", async () => {
      const app = await buildApp();
      const { token: zeroMemStudentToken, userId: zeroUserId } =
        await createAuthenticatedUser(app, "nomem-student@avana.test", "student");

      // Ensure 0 memberships
      orgStore.clearMembershipsForUser(zeroUserId as UserId);
      const mems = await orgStore.listMembershipsByUserId(zeroUserId);
      expect(mems).toHaveLength(0);

      const someOrgId = randomUUID();
      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="file.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `pdf\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${someOrgId}/documents`,
        cookies: { avana_session: zeroMemStudentToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(404);

      await app.close();
    });

    it("Scenario G (Security Test): Non-admin cannot read, list, or extract documents in another org without membership", async () => {
      const app = await buildApp();
      const { token: victimToken } =
        await createAuthenticatedUser(app, "victim@avana.test", "student");
      const { token: attackerToken } =
        await createAuthenticatedUser(app, "attacker@avana.test", "student");

      // Victim creates org & uploads document
      const orgRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: victimToken },
        payload: { name: "Victim Org" },
      });
      const victimOrgId = (orgRes.json() as { organization: { id: string } }).organization.id;

      const boundary = "------------------------boundary123";
      const body = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="confidential.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n` +
        `confidential material\r\n` +
        `--${boundary}--\r\n`
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${victimOrgId}/documents`,
        cookies: { avana_session: victimToken },
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      const docId = (uploadRes.json() as { document: { id: string } }).document.id;

      // 1. Attacker tries to list documents in victim org -> 404
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${victimOrgId}/documents`,
        cookies: { avana_session: attackerToken },
      });
      expect(listRes.statusCode).toBe(404);

      // 2. Attacker tries to get single document in victim org -> 404
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${victimOrgId}/documents/${docId}`,
        cookies: { avana_session: attackerToken },
      });
      expect(getRes.statusCode).toBe(404);

      // 3. Attacker tries to trigger extraction in victim org -> 403 Forbidden
      const extractRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${victimOrgId}/documents/${docId}/extract`,
        cookies: { avana_session: attackerToken },
      });
      expect(extractRes.statusCode).toBe(403);

      await app.close();
    });

    it("Scenario H: GenerationService authorizes platform_admin on existing org, fails on non-existent org, and denies student without membership", async () => {
      const existingOrgId = randomUUID() as OrganizationId;
      await orgStore.createWithAdminMembership({
        organization: {
          id: existingOrgId,
          name: "Gen Test Org",
          slug: "gen-test-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: randomUUID(),
          organizationId: existingOrgId,
          userId: randomUUID(),
          role: "organization_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const genService = new GenerationService(
        genStore,
        citStore,
        undefined,
        documentStore,
        chunkStore,
        defaultPolicy,
        auditService,
        orgStore,
      );

      const adminActor: Actor = { userId: randomUUID(), role: "platform_admin" };
      const studentActor: Actor = { userId: randomUUID(), role: "student" };
      const nonExistentOrgId = randomUUID() as OrganizationId;

      // 1. platform_admin on existing org -> succeeds
      await expect(genService.authorize(adminActor, existingOrgId, "content:generate")).resolves.toBeUndefined();

      // 2. platform_admin on non-existent org -> fails with 404
      await expect(genService.authorize(adminActor, nonExistentOrgId, "content:generate")).rejects.toThrow(
        new DomainError("not_found", "Organization not found"),
      );

      // 3. student on existing org without membership -> fails with 404
      await expect(genService.authorize(studentActor, existingOrgId, "content:generate")).rejects.toThrow(
        new DomainError("not_found", "Organization not found"),
      );
    });
  });
});
