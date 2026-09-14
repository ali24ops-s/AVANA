import { describe, it, expect, beforeEach } from "vitest";
import { GenerationActiveStatusService } from "./generation-active-status-service.js";
import { GenerationQueryService } from "./generation-query-service.js";
import { InMemoryGenerationChunkStore } from "../generation-chunk-store.js";
import { GenerationProgressService } from "../generation-progress-service.js";
import { InMemoryGenerationProgressStore } from "../generation-progress-store.js";
import { InMemoryGeneratedContentStore } from "../test/in-memory-stores.js";
import type { DocumentRecord, DocumentStore } from "../../learning/learning-store.js";
import type { OrganizationStore, OrganizationMembershipRecord, OrganizationRecord } from "../../organizations/organization-store.js";
import type {
  Actor,
  DocumentId,
  OrganizationId,
  CourseId,
  GeneratedContentId,
  GeneratedContentPayload,
} from "@avana/domain";

describe("GenerationActiveStatusService (Unit Tests)", () => {
  let activeStatusService: GenerationActiveStatusService;
  let queryService: GenerationQueryService;
  let chunkStore: InMemoryGenerationChunkStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let contentStore: InMemoryGeneratedContentStore;
  let mockDocStore: DocumentStore;
  let mockOrgStore: OrganizationStore;
  let docs: DocumentRecord[];

  const orgId = "org-1" as OrganizationId;
  const orgId2 = "org-2" as OrganizationId;
  const courseId = "course-1" as CourseId;
  const studentActor: Actor = { userId: "student-1", role: "student", organizationId: orgId };
  const adminActor: Actor = { userId: "admin-1", role: "organization_admin", organizationId: orgId };
  const platformAdminActor: Actor = { userId: "padmin-1", role: "platform_admin" };

  beforeEach(() => {
    chunkStore = new InMemoryGenerationChunkStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    contentStore = new InMemoryGeneratedContentStore();
    docs = [];

    mockDocStore = {
      listByOrganization: async (oId: string) => {
        return docs.filter((d) => d.organizationId === oId && d.deletedAt === null);
      },
      listByOwner: async (oId: string, userId: string) => {
        return docs.filter(
          (d) => d.organizationId === oId && d.ownerUserId === userId && d.deletedAt === null,
        );
      },
      findByIdForOrganization: async (id: string, oId: string) => {
        return docs.find((d) => d.id === id && d.organizationId === oId && d.deletedAt === null) ?? null;
      },
      update: async (doc: DocumentRecord) => {
        const idx = docs.findIndex((d) => d.id === doc.id);
        if (idx >= 0) {
          docs[idx] = { ...doc };
          return docs[idx];
        }
        return doc;
      },
    } as unknown as DocumentStore;

    mockOrgStore = {
      findById: async (id: string) => {
        if (id === orgId || id === orgId2) {
          return { id, name: `Org ${id}` } as unknown as OrganizationRecord;
        }
        return null;
      },
      findMembership: async (oId: string, userId: string) => {
        if (userId === "student-1") {
          return { organizationId: oId, userId, role: "student" } as unknown as OrganizationMembershipRecord;
        }
        if (userId === "admin-1") {
          return { organizationId: oId, userId, role: "organization_admin" } as unknown as OrganizationMembershipRecord;
        }
        return null;
      },
      listMembershipsByUserId: async (userId: string) => {
        if (userId === "student-1") {
          return [{ organizationId: orgId, userId, role: "student" }] as unknown as OrganizationMembershipRecord[];
        }
        if (userId === "admin-1") {
          return [
            { organizationId: orgId, userId, role: "organization_admin" },
            { organizationId: orgId2, userId, role: "organization_admin" },
          ] as unknown as OrganizationMembershipRecord[];
        }
        return [];
      },
      listAll: async () => {
        return [{ id: orgId }, { id: orgId2 }] as unknown as OrganizationRecord[];
      },
    } as unknown as OrganizationStore;

    queryService = new GenerationQueryService(
      mockDocStore,
      chunkStore,
      progressService,
    );

    activeStatusService = new GenerationActiveStatusService(
      mockDocStore,
      contentStore,
      progressService,
      queryService,
      mockOrgStore,
      undefined,
    );
  });

  describe("getActiveGenerations", () => {
    it("returns active items for running generation", async () => {
      const doc1: DocumentRecord = {
        id: "doc-1" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "cardiology.pdf",
        status: "generating",
        ownerUserId: "student-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc1);

      await progressService.startStage(doc1.id, orgId, "lesson", 10);

      const items = await activeStatusService.getActiveGenerations(adminActor, orgId);
      expect(items.length).toBe(1);
      expect(items[0].documentId).toBe("doc-1");
      expect(items[0].status).toBe("generating");
    });

    it("scopes to owner documents for student role", async () => {
      const docMine: DocumentRecord = {
        id: "doc-mine" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "mine.pdf",
        status: "generating",
        ownerUserId: "student-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;

      const docOther: DocumentRecord = {
        id: "doc-other" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "other.pdf",
        status: "generating",
        ownerUserId: "other-user",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;

      docs.push(docMine, docOther);

      const items = await activeStatusService.getActiveGenerations(studentActor, orgId);
      expect(items.length).toBe(1);
      expect(items[0].documentId).toBe("doc-mine");
    });

    it("includes stopped and recent failed generations (< 3 minutes)", async () => {
      const docStopped: DocumentRecord = {
        id: "doc-stopped" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "stopped.pdf",
        status: "extracted",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;

      const docFailedRecent: DocumentRecord = {
        id: "doc-failed" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "failed.pdf",
        status: "failed",
        ownerUserId: "admin-1",
        errorCode: "TIMEOUT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
        deletedAt: null,
      } as unknown as DocumentRecord;

      const docFailedOld: DocumentRecord = {
        id: "doc-failed-old" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "failed-old.pdf",
        status: "failed",
        ownerUserId: "admin-1",
        errorCode: "TIMEOUT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() - 300000).toISOString(), // 5 mins ago (> 3 mins)
        deletedAt: null,
      } as unknown as DocumentRecord;

      docs.push(docStopped, docFailedRecent, docFailedOld);

      await progressService.startStage(docStopped.id, orgId, "lesson", 10);
      await progressService.stop(docStopped.id, orgId);

      await progressService.startStage(docFailedRecent.id, orgId, "lesson", 10);
      await progressService.fail(docFailedRecent.id, orgId, "Some error");

      const oldTime = new Date(Date.now() - 300000).toISOString();
      await progressStore.upsert({
        documentId: docFailedOld.id,
        organizationId: orgId,
        status: "failed",
        stage: "lesson",
        progressCurrent: 0,
        progressTotal: 10,
        stageStartedAt: oldTime,
        lastActivityAt: oldTime,
        errorMessage: "Old error",
        version: 1,
        createdAt: oldTime,
        updatedAt: oldTime,
      });

      const items = await activeStatusService.getActiveGenerations(adminActor, orgId);
      const returnedIds = items.map((i) => i.documentId);
      expect(returnedIds).toContain("doc-stopped");
      expect(returnedIds).toContain("doc-failed");
      expect(returnedIds).not.toContain("doc-failed-old");
    });

    it("reconciles stale abandoned generating document without active worker to review_pending if drafts exist", async () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago (> 5 mins threshold)
      const docStale: DocumentRecord = {
        id: "doc-stale-drafts" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "stale.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: staleTime,
        updatedAt: staleTime,
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(docStale);

      // Create a draft content
      await contentStore.create({
        id: "gen-1" as unknown as GeneratedContentId,
        documentId: docStale.id,
        organizationId: orgId,
        type: "lesson",
        status: "draft",
        payload: { sessions: [{ title: "S1" }] } as unknown as GeneratedContentPayload,
        confidenceScore: 0.9,
        reviewNotes: null,
        reviewedByUserId: null,
        reviewedAt: null,
        deletedAt: null,
        createdAt: staleTime,
        updatedAt: staleTime,
      });

      await activeStatusService.getActiveGenerations(adminActor, orgId);

      // Verify mutation in DB
      const updated = docs.find((d) => d.id === "doc-stale-drafts");
      expect(updated?.status).toBe("review_pending");
      expect(updated?.errorCode).toBe("GENERATION_TIMEOUT_STALE");
    });

    it("reconciles stale abandoned generating document without active worker to extracted if no drafts exist", async () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago (> 5 mins threshold)
      const docStale: DocumentRecord = {
        id: "doc-stale-nodrafts" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "stale-no-drafts.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: staleTime,
        updatedAt: staleTime,
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(docStale);

      await activeStatusService.getActiveGenerations(adminActor, orgId);

      const updated = docs.find((d) => d.id === "doc-stale-nodrafts");
      expect(updated?.status).toBe("extracted");
      expect(updated?.errorCode).toBe("GENERATION_TIMEOUT_STALE");
    });

    it("does NOT reconcile stale generating document if worker lease is actively running", async () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const docActiveWorker: DocumentRecord = {
        id: "doc-active-worker" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "active-worker.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: staleTime,
        updatedAt: staleTime,
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(docActiveWorker);

      // Register active worker chunk with valid lease
      await chunkStore.upsert({
        id: "chunk-running",
        documentId: docActiveWorker.id,
        organizationId: orgId,
        stage: "lesson",
        chunkIndex: 0,
        chunkKey: "lesson:0",
        status: "running",
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        attempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await activeStatusService.getActiveGenerations(adminActor, orgId);

      const doc = docs.find((d) => d.id === "doc-active-worker");
      expect(doc?.status).toBe("generating");
      expect(doc?.errorCode).toBeNull();
    });
  });

  describe("getGlobalActiveGenerations", () => {
    it("aggregates active generations across multiple organizations for platform_admin", async () => {
      const docOrg1: DocumentRecord = {
        id: "doc-org-1" as DocumentId,
        organizationId: orgId,
        courseId,
        originalName: "doc1.pdf",
        status: "generating",
        ownerUserId: "user-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;

      const docOrg2: DocumentRecord = {
        id: "doc-org-2" as DocumentId,
        organizationId: orgId2,
        courseId,
        originalName: "doc2.pdf",
        status: "generating",
        ownerUserId: "user-2",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;

      docs.push(docOrg1, docOrg2);

      const globalItems = await activeStatusService.getGlobalActiveGenerations(platformAdminActor);
      expect(globalItems.length).toBe(2);
      const returnedIds = globalItems.map((i) => i.documentId);
      expect(returnedIds).toContain("doc-org-1");
      expect(returnedIds).toContain("doc-org-2");
    });
  });
});
