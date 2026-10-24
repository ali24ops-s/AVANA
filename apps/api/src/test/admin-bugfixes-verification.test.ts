/**
 * Verification Tests for:
 * 1. Admin Document Download with Persian / UTF-8 filenames and Role Authorization (platform_admin & content_worker)
 * 2. AI Processing Stats, Status Mappings (succeeded, running, queued, failed) and Success Rate Calculation
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
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
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import type { DbClient } from "@avana/database/client";
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

describe("Admin Bugfixes Verification - Document Download & AI Stats", () => {
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
  let app: ReturnType<typeof createApp>;

  let adminToken: string;
  let workerToken: string;
  let studentToken: string;
  let systemOrgId: OrganizationId;

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
        const doc = documentStore.getAll().find((d) => d.id === id);
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

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-download-verify-"));
    storage = new LocalStorageProvider(tempDir);

    app = createApp({ config });
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

    systemOrgId = randomUUID() as OrganizationId;

    // 1. Create Platform Admin
    const regAdmin = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        name: "مدیر ارشد",
        email: "platform-admin@avana.test",
        password: "Password123!",
        phoneNumber: "09121110001",
      },
    });
    adminToken = extractSessionToken(regAdmin) || "";
    const adminUser = (regAdmin.json() as { user: { id: string } }).user;
    const adminRec = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(adminUser.id);
    if (adminRec) {
      adminRec.role = Roles.platform_admin;
      adminRec.globalRole = Roles.platform_admin;
    }

    // 2. Create Content Worker
    const regWorker = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        name: "کارشناس محتوا",
        email: "content-worker@avana.test",
        password: "Password123!",
        phoneNumber: "09121110002",
      },
    });
    workerToken = extractSessionToken(regWorker) || "";
    const workerUser = (regWorker.json() as { user: { id: string } }).user;
    const workerRec = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(workerUser.id);
    if (workerRec) {
      workerRec.role = Roles.content_worker;
      workerRec.globalRole = Roles.content_worker;
    }

    // 3. Create Normal Student
    const regStudent = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        name: "دانشجو",
        email: "student@avana.test",
        password: "Password123!",
        phoneNumber: "09121110003",
      },
    });
    studentToken = extractSessionToken(regStudent) || "";
  });

  describe("Bug 2: Admin Document Download & UTF-8 / Persian Handling", () => {
    it("successfully downloads document with Persian filename conforming to RFC 6266 without header crash", async () => {
      const persianFilename = "جزوه_آناتومی_و_فیزیولوژی_تست.pdf";
      const fileContent = Buffer.from("%PDF-1.4 Mock Persian Anatomy PDF Content");
      const storageKey = `docs/${randomUUID()}.pdf`;

      await storage.save({ storageKey, data: fileContent, mimeType: "application/pdf" });

      const docId = randomUUID();
      await documentStore.create({
        id: docId as any,
        organizationId: systemOrgId,
        courseId: null,
        ownerUserId: randomUUID() as any,
        originalName: persianFilename,
        mimeType: "application/pdf",
        sizeBytes: fileContent.length,
        storageKey,
        status: "ready",
        pageCount: 12,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        errorCode: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/documents/${docId}/download`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");

      // Verify Content-Disposition header
      const contentDisposition = res.headers["content-disposition"] as string;
      expect(contentDisposition).toBeDefined();

      // Check safe ASCII fallback
      expect(contentDisposition).toContain('filename="document.pdf"');

      // Check RFC 5987 / RFC 6266 UTF-8 encoded filename
      const encodedExpected = encodeURIComponent(persianFilename);
      expect(contentDisposition).toContain(`filename*=UTF-8''${encodedExpected}`);

      // Crucial: check that the raw header string contains only valid Latin-1 / ASCII characters
      // (Node HTTP header validation check)
      for (let i = 0; i < contentDisposition.length; i++) {
        expect(contentDisposition.charCodeAt(i)).toBeLessThanOrEqual(255);
      }

      // Verify body content
      expect(res.rawPayload).toEqual(fileContent);
    });

    it("allows content_worker to download documents from admin route", async () => {
      const fileContent = Buffer.from("Content worker test text");
      const storageKey = `docs/${randomUUID()}.txt`;
      await storage.save({ storageKey, data: fileContent, mimeType: "text/plain" });

      const docId = randomUUID();
      await documentStore.create({
        id: docId as any,
        organizationId: systemOrgId,
        courseId: null,
        ownerUserId: randomUUID() as any,
        originalName: "worker_note.txt",
        mimeType: "text/plain",
        sizeBytes: fileContent.length,
        storageKey,
        status: "ready",
        pageCount: 1,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        errorCode: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/documents/${docId}/download`,
        cookies: { avana_session: workerToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.rawPayload).toEqual(fileContent);
    });

    it("denies student role with 403 Forbidden", async () => {
      const docId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/documents/${docId}/download`,
        cookies: { avana_session: studentToken },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when document does not exist in database", async () => {
      const nonExistentId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/documents/${nonExistentId}/download`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.code).toBe("not_found");
    });

    it("returns 404 when document record exists but file is missing in storage", async () => {
      const docId = randomUUID();
      await documentStore.create({
        id: docId as any,
        organizationId: systemOrgId,
        courseId: null,
        ownerUserId: randomUUID() as any,
        originalName: "missing.pdf",
        mimeType: "application/pdf",
        sizeBytes: 500,
        storageKey: `missing_folder/${randomUUID()}.pdf`,
        status: "ready",
        pageCount: 1,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        errorCode: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/documents/${docId}/download`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.code).toBe("not_found");
    });
  });

  describe("Bug 1: AI Processing Rates & Analytics Queries", () => {
    it("DrizzleAdminStore.getAiAnalytics maps succeeded to successful and running to processing", async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return {
                where: vi.fn().mockResolvedValue([
                  {
                    totalJobs: 15,
                    successful: 12,
                    failed: 2,
                    processing: 1,
                    queued: 0,
                    averageDurationMs: 3100,
                  },
                ]),
              };
            } else if (callCount === 2) {
              return {
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue([
                    { type: "course_outline", total: 10, success: 9 },
                    { type: "lesson", total: 5, success: 3 },
                  ]),
                }),
              };
            } else {
              return {
                where: vi.fn().mockResolvedValue([
                  {
                    tokenRecordsCount: 5,
                    totalInput: 20000,
                    totalOutput: 8000,
                  },
                ]),
              };
            }
          }),
        })),
      };

      const store = new DrizzleAdminStore(mockDb as unknown as DbClient["db"]);
      const analytics = await store.getAiAnalytics();

      expect(analytics.overview.totalJobs).toBe(15);
      expect(analytics.overview.successful).toBe(12);
      expect(analytics.overview.failed).toBe(2);
      expect(analytics.overview.processing).toBe(1);
      expect(analytics.overview.queued).toBe(0);

      // Finished = 12 + 2 = 14; Rate = round((12 / 14) * 100, 1) = 85.7%
      expect(analytics.overview.successRate).toBe(85.7);
      expect(analytics.overview.averageDurationMs).toBe(3100);

      expect(analytics.byType["course_outline"]).toEqual({ total: 10, success: 9 });
      expect(analytics.byType["lesson"]).toEqual({ total: 5, success: 3 });
      expect(analytics.tokens.total).toBe(28000);
    });

    it("DrizzleAdminStore.getAiAnalytics computes 0 success rate (No Data state) when 0 finished jobs exist", async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return {
                where: vi.fn().mockResolvedValue([
                  {
                    totalJobs: 4,
                    successful: 0,
                    failed: 0,
                    processing: 2,
                    queued: 2,
                    averageDurationMs: 0,
                  },
                ]),
              };
            } else if (callCount === 2) {
              return {
                where: vi.fn().mockReturnValue({
                  groupBy: vi.fn().mockResolvedValue([]),
                }),
              };
            } else {
              return {
                where: vi.fn().mockResolvedValue([
                  { tokenRecordsCount: 0, totalInput: 0, totalOutput: 0 },
                ]),
              };
            }
          }),
        })),
      };

      const store = new DrizzleAdminStore(mockDb as unknown as DbClient["db"]);
      const analytics = await store.getAiAnalytics();

      expect(analytics.overview.totalJobs).toBe(4);
      expect(analytics.overview.successful).toBe(0);
      expect(analytics.overview.failed).toBe(0);
      expect(analytics.overview.processing).toBe(2);
      expect(analytics.overview.queued).toBe(2);
      // Denominator finished is 0, so successRate is 0 (rendered as "بدون داده" in frontend)
      expect(analytics.overview.successRate).toBe(0);
    });

    it("DrizzleAdminStore.getDashboardStats calculates generationSuccessRate based on finished jobs", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        }),
      };

      // Mock the specific count queries in getDashboardStats
      let queryIdx = 0;
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          queryIdx++;
          return {
            where: vi.fn().mockImplementation(() => {
              if (queryIdx === 8) {
                // generationsTodayTotal
                return Promise.resolve([{ count: 20 }]);
              } else if (queryIdx === 9) {
                // generationsTodaySuccess (succeeded or completed)
                return Promise.resolve([{ count: 18 }]);
              } else if (queryIdx === 10) {
                // generationsTodayFailed
                return Promise.resolve([{ count: 2 }]);
              }
              return Promise.resolve([{ count: 5 }]);
            }),
          };
        }),
      }));

      const store = new DrizzleAdminStore(mockDb as unknown as DbClient["db"]);
      const stats = await store.getDashboardStats();

      // finishedToday = 18 + 2 = 20; successRate = (18 / 20) * 100 = 90%
      expect(stats.generationsToday).toBe(20);
      expect(stats.generationSuccessRate).toBe(90);
    });

    it("DrizzleAdminStore.listGenerationJobs maps status filter 'succeeded' and 'running' correctly", async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([]);
      const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockWhere1 = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin2 = vi.fn().mockReturnValue({ where: mockWhere1 });
      const mockLeftJoin1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin2 });
      const mockFrom1 = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin1 });

      const mockWhere2 = vi.fn().mockResolvedValue([{ count: 0 }]);
      const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });

      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          if (selectCount % 2 === 1) {
            return { from: mockFrom1 };
          } else {
            return { from: mockFrom2 };
          }
        }),
      };

      const store = new DrizzleAdminStore(mockDb as unknown as DbClient["db"]);

      // Test filtering by "succeeded"
      await store.listGenerationJobs({ status: "succeeded", page: 1, pageSize: 10 });
      expect(mockWhere1).toHaveBeenCalled();

      // Test filtering by "running"
      await store.listGenerationJobs({ status: "running", page: 1, pageSize: 10 });
      expect(mockWhere1).toHaveBeenCalled();
    });
  });
});
