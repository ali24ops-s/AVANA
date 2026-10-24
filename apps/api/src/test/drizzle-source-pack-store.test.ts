import { describe, it, expect, beforeEach } from "vitest";
import {
  asCourseId,
  asDocumentId,
  asOrganizationId,
  asSourcePackId,
  asUserId,
  DomainError,
} from "@avana/domain";
import { DrizzleSourcePackStore } from "../modules/source-packs/drizzle-source-pack-store.js";
import { SourcePackService } from "../modules/source-packs/source-pack-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { sourcePackRoutes } from "../modules/source-packs/source-pack-routes.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import type { CourseStore, CourseRecord } from "../modules/courses/course-store.js";
import type { DocumentStore, DocumentRecord } from "../modules/learning/learning-store.js";
import type { GenerationQueue, GenerationJobPayload } from "../modules/generation/generation-queue.js";

describe("DrizzleSourcePackStore & SourcePack Regression Tests", () => {
  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
  const courseId = asCourseId("00000000-0000-0000-0000-000000000002");
  const userId = asUserId("00000000-0000-0000-0000-000000000003");
  const doc1Id = asDocumentId("00000000-0000-0000-0000-000000000011");
  const doc2Id = asDocumentId("00000000-0000-0000-0000-000000000012");

  describe("Date Mapping Invariants in DrizzleSourcePackStore", () => {
    it("safely maps valid Date objects and ISO strings without throwing TypeError", async () => {
      const now = new Date();
      const isoNow = now.toISOString();

      // Mock Drizzle db instance
      const mockDb: any = {
        transaction: async (cb: any) => {
          let insertCount = 0;
          const tx: any = {
            insert: () => ({
              values: () => ({
                returning: async () => {
                  insertCount++;
                  if (insertCount === 1) {
                    return [
                      {
                        id: "pack-1",
                        organizationId: orgId,
                        courseId,
                        title: "تست تاریخ",
                        status: "active",
                        createdAt: now,
                        updatedAt: isoNow,
                        deletedAt: null,
                      },
                    ];
                  }
                  return [
                    {
                      id: "sp-doc-1",
                      sourcePackId: "pack-1",
                      documentId: doc1Id,
                      role: "primary",
                      orderIndex: 0,
                      createdAt: now,
                    },
                  ];
                },
              }),
            }),
            select: () => ({
              from: () => ({
                where: async () => [
                  {
                    originalName: "test.pdf",
                    status: "ready",
                    mimeType: "application/pdf",
                    sizeBytes: 1024,
                  },
                ],
              }),
            }),
          };

          return await cb(tx);
        },
      };

      const store = new DrizzleSourcePackStore(mockDb);
      const res = await store.create({
        organizationId: orgId,
        courseId,
        title: "تست تاریخ",
        documents: [{ documentId: doc1Id, role: "primary", orderIndex: 0 }],
      });

      expect(res.createdAt).toBe(isoNow);
      expect(res.updatedAt).toBe(isoNow);
      expect(res.deletedAt).toBeNull();
      expect(res.documents[0].createdAt).toBe(isoNow);
    });

    it("rejects invalid date values without silent fallback", async () => {
      const mockDb: any = {
        transaction: async (cb: any) => {
          const tx: any = {
            insert: () => ({
              values: () => ({
                returning: async () => [
                  {
                    id: "pack-1",
                    organizationId: orgId,
                    courseId,
                    title: "تست تاریخ نامعتبر",
                    status: "active",
                    createdAt: new Date("invalid-date-string"),
                    updatedAt: new Date(),
                    deletedAt: null,
                  },
                ],
              }),
            }),
          };
          return await cb(tx);
        },
      };

      const store = new DrizzleSourcePackStore(mockDb);
      await expect(
        store.create({
          organizationId: orgId,
          courseId,
          title: "تست تاریخ نامعتبر",
          documents: [],
        }),
      ).rejects.toThrow("Invalid date value encountered in source pack");
    });
  });

  describe("HTTP & Service Integration: Update & Not Found handling", () => {
    let mockDocs: Map<string, DocumentRecord>;
    let mockCourses: Map<string, CourseRecord>;
    let mockDocumentStore: DocumentStore;
    let mockCourseStore: CourseStore;
    let enqueuedJobs: GenerationJobPayload[];
    let sessionCookie: string;
    let app: ReturnType<typeof createApp>;

    beforeEach(async () => {
      const config = loadApiConfig();

      mockDocs = new Map<string, DocumentRecord>([
        [
          doc1Id,
          {
            id: doc1Id,
            organizationId: orgId,
            courseId,
            ownerUserId: userId,
            originalName: "Document 1.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            sha256: "hash1",
            storageKey: "key1",
            pageCount: 5,
            status: "ready",
            errorCode: null,
            retryCount: 0,
            qualityScore: 90,
            qualityLevel: "high",
            qualityReport: null,
            qualityAnalyzedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        [
          doc2Id,
          {
            id: doc2Id,
            organizationId: orgId,
            courseId,
            ownerUserId: userId,
            originalName: "Document 2.pdf",
            mimeType: "application/pdf",
            sizeBytes: 4096,
            sha256: "hash2",
            storageKey: "key2",
            pageCount: 10,
            status: "ready",
            errorCode: null,
            retryCount: 0,
            qualityScore: 95,
            qualityLevel: "high",
            qualityReport: null,
            qualityAnalyzedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
      ]);

      mockCourses = new Map([
        [
          courseId,
          {
            id: courseId,
            organizationId: orgId,
            ownerUserId: userId,
            name: "درس آزمایشی",
            description: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
      ]);

      mockDocumentStore = {
        findById: async (id) => mockDocs.get(id),
        findByIdForOrganization: async (id, org) => {
          const d = mockDocs.get(id);
          return d?.organizationId === org ? d : undefined;
        },
        listByCourse: async (cId, org) =>
          Array.from(mockDocs.values()).filter(
            (d) => d.organizationId === org && d.courseId === cId,
          ),
        listByOrganization: async (org, cId) =>
          Array.from(mockDocs.values()).filter(
            (d) => d.organizationId === org && (!cId || d.courseId === cId),
          ),
        listByOwner: async (org, owner) =>
          Array.from(mockDocs.values()).filter(
            (d) => d.organizationId === org && d.ownerUserId === owner,
          ),
        findByOrganizationAndSha256: async (org, sha) =>
          Array.from(mockDocs.values()).find(
            (d) => d.organizationId === org && d.sha256 === sha,
          ),
        create: async (doc) => {
          mockDocs.set(doc.id, doc);
          return doc;
        },
        update: async (doc) => {
          mockDocs.set(doc.id, doc);
          return doc;
        },
        reserveForGeneration: async (id, org) => {
          const doc = mockDocs.get(id);
          if (!doc || doc.organizationId !== org) return undefined;
          if (doc.status === "generating" || doc.status === "pending_generation") return undefined;
          const prev = doc.status;
          doc.status = "pending_generation";
          return { previousStatus: prev, document: doc };
        },
      };

      mockCourseStore = {
        create: async (r) => r.course,
        findById: async (cId) => mockCourses.get(cId),
        findByIdForUser: async (cId) => mockCourses.get(cId),
        listByOrganization: async () => Array.from(mockCourses.values()),
      };

      enqueuedJobs = [];
      const mockGenerationQueue: GenerationQueue = {
        enqueueGenerationJob: async (payload) => {
          enqueuedJobs.push(JSON.parse(JSON.stringify(payload)));
          return {
            generationJobId: payload.jobId as any,
            jobId: "bull-job-test",
            status: "queued",
          };
        },
      };

      const dbPacks = new Map<string, any>();

      const mockDbStore: any = {
        create: async (input: any) => {
          const packId = "pack-db-1";
          const now = new Date();
          const docItems = input.documents.map((d: any) => ({
            id: `spd-${d.documentId}`,
            sourcePackId: packId,
            documentId: d.documentId,
            role: d.role,
            orderIndex: d.orderIndex,
            createdAt: now,
            originalName: mockDocs.get(d.documentId)?.originalName,
            status: mockDocs.get(d.documentId)?.status,
            mimeType: mockDocs.get(d.documentId)?.mimeType,
            sizeBytes: mockDocs.get(d.documentId)?.sizeBytes,
          }));

          const record = {
            id: asSourcePackId(packId),
            organizationId: input.organizationId,
            courseId: input.courseId,
            title: input.title,
            status: "active",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            deletedAt: null,
            documents: docItems.map((d: any) => ({
              ...d,
              createdAt: d.createdAt.toISOString(),
            })),
          };
          dbPacks.set(packId, record);
          return record;
        },
        findById: async (id: any, org: any) => {
          const p = dbPacks.get(id);
          if (!p || p.organizationId !== org) return undefined;
          return p;
        },
        listByCourse: async (cId: any, org: any) => {
          return Array.from(dbPacks.values()).filter(
            (p) => p.courseId === cId && p.organizationId === org,
          );
        },
        update: async (id: any, org: any, input: any) => {
          const existing = dbPacks.get(id);
          if (!existing || existing.organizationId !== org) {
            throw new DomainError("not_found", "Source pack not found");
          }
          const updated = {
            ...existing,
            title: input.title ?? existing.title,
            updatedAt: new Date().toISOString(),
          };
          if (input.documents) {
            updated.documents = input.documents.map((d: any) => ({
              id: `spd-${d.documentId}`,
              sourcePackId: id,
              documentId: d.documentId,
              role: d.role,
              orderIndex: d.orderIndex,
              createdAt: new Date().toISOString(),
              originalName: mockDocs.get(d.documentId)?.originalName,
              status: mockDocs.get(d.documentId)?.status,
              mimeType: mockDocs.get(d.documentId)?.mimeType,
              sizeBytes: mockDocs.get(d.documentId)?.sizeBytes,
            }));
          }
          dbPacks.set(id, updated);
          return updated;
        },
        delete: async (id: any) => {
          dbPacks.delete(id);
        },
      };

      const service = new SourcePackService({
        store: mockDbStore,
        documentStore: mockDocumentStore,
        courseStore: mockCourseStore,
        generationQueue: mockGenerationQueue,
      });

      const userStore = new InMemoryUserStore();
      const user = await userStore.createUserWithPassword({
        email: "test@avana.test",
        passwordHash: "hash",
        name: "Test User",
        globalRole: "student",
      });

      const sessionStore = new InMemorySessionStore();
      const sessionService = new SessionService(sessionStore, config.session);
      const session = await sessionService.createSession(user.id);
      sessionCookie = session.sessionToken;

      app = createApp({ config });
      await app.register(sourcePackRoutes, {
        service,
        sessionService,
        userStore,
      });
    });

    it("successfully creates and updates a source pack, safely mapping timestamps with HTTP 200", async () => {
      // 1. Create Pack
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: {
          title: "پک اولیه",
          documents: [
            { document_id: doc1Id, role: "primary" },
            { document_id: doc2Id, role: "supplementary" },
          ],
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createdBody = JSON.parse(createRes.body);
      const packId = createdBody.source_pack.id;
      expect(createdBody.source_pack.title).toBe("پک اولیه");
      expect(createdBody.source_pack.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // 2. Update Pack (title and switch primary)
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: {
          title: "پک به‌روزشده",
          documents: [
            { document_id: doc2Id, role: "primary" },
            { document_id: doc1Id, role: "supplementary" },
          ],
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const updatedBody = JSON.parse(updateRes.body);
      expect(updatedBody.source_pack.title).toBe("پک به‌روزشده");
      expect(updatedBody.source_pack.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const primary = updatedBody.source_pack.documents.find((d: any) => d.role === "primary_notes");
      expect(primary.document_id).toBe(doc2Id);
    });

    it("returns HTTP 404 (not_found) and NOT HTTP 500 when updating a non-existent pack", async () => {
      const nonExistentPackId = "00000000-0000-0000-0000-000000000999";
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${nonExistentPackId}`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: {
          title: "تغییر عنوان پک ناموجود",
        },
      });

      expect(updateRes.statusCode).toBe(404);
      const body = JSON.parse(updateRes.body);
      expect(body.error.code).toBe("not_found");
      expect(body.error.message).toContain("Source pack not found");
      expect(updateRes.statusCode).not.toBe(500);
    });

    it("verifies unified generation and snapshot isolation: mutating pack afterwards does not mutate enqueued sources", async () => {
      // 1. Create Pack
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: {
          title: "پک زیست‌شناسی",
          documents: [
            { document_id: doc1Id, role: "primary" },
            { document_id: doc2Id, role: "supplementary" },
          ],
        },
      });
      const packId = JSON.parse(createRes.body).source_pack.id;

      // 2. Generate Unified Content
      const genRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}/generate`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: { types: ["lesson", "quiz"] },
      });

      expect(genRes.statusCode).toBe(202);
      expect(enqueuedJobs).toHaveLength(1);
      const enqueuedJob = enqueuedJobs[0];
      expect(enqueuedJob.sources).toHaveLength(2);
      expect(enqueuedJob.sources![0].documentId).toBe(doc1Id);
      expect(enqueuedJob.sources![0].order).toBe(0);
      expect(enqueuedJob.sources![1].documentId).toBe(doc2Id);
      expect(enqueuedJob.sources![1].order).toBe(1);

      // 3. Mutate the Source Pack: change title and switch primary
      await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}`,
        headers: { authorization: `Bearer ${sessionCookie}` },
        payload: {
          title: "پک تغییر یافته",
          documents: [
            { document_id: doc2Id, role: "primary" },
            { document_id: doc1Id, role: "supplementary" },
          ],
        },
      });

      // 4. Verify snapshot isolation: the already enqueued job sources remain unchanged!
      expect(enqueuedJob.sources![0].documentId).toBe(doc1Id);
      expect(enqueuedJob.sources![0].order).toBe(0);
      expect(enqueuedJob.sources![1].documentId).toBe(doc2Id);
      expect(enqueuedJob.sources![1].order).toBe(1);
    });
  });
});
