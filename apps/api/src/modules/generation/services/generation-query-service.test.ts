import { describe, it, expect, beforeEach } from "vitest";
import { GenerationQueryService } from "./generation-query-service.js";
import { InMemoryGenerationChunkStore } from "../generation-chunk-store.js";
import { GenerationProgressService } from "../generation-progress-service.js";
import { InMemoryGenerationProgressStore } from "../generation-progress-store.js";
import type { DocumentRecord, DocumentStore } from "../../learning/learning-store.js";
import type { Actor, DocumentId, OrganizationId } from "@avana/domain";

describe("GenerationQueryService (Unit Tests)", () => {
  let queryService: GenerationQueryService;
  let chunkStore: InMemoryGenerationChunkStore;
  let progressService: GenerationProgressService;
  let mockDocStore: DocumentStore;

  const orgId = "org-1" as OrganizationId;
  const docId = "doc-1" as DocumentId;
  const actor: Actor = { userId: "user-1", role: "student", organizationId: orgId };

  beforeEach(() => {
    chunkStore = new InMemoryGenerationChunkStore();
    progressService = new GenerationProgressService(new InMemoryGenerationProgressStore());
    mockDocStore = {
      findByIdForOrganization: async (id: string, org: string) => {
        if (id === docId && org === orgId) {
          return {
            id: docId,
            organizationId: orgId,
            originalName: "pharmacology.pdf",
            courseId: "course-1",
            status: "extracted",
            ownerUserId: "user-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          } as unknown as DocumentRecord;
        }
        return null;
      },
    } as unknown as DocumentStore;

    queryService = new GenerationQueryService(
      mockDocStore,
      chunkStore,
      progressService,
    );
  });

  describe("getGenerationProgress", () => {
    it("returns queued progress when no chunks exist", async () => {
      const progress = await queryService.getGenerationProgress(docId, orgId);
      expect(progress.status).toBe("queued");
      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(26); // default 1 planning + 8 sessions * 3 stages + 1 review_summary
    });

    it("calculates completed chunks accurately when requestedTypes is passed", async () => {
      await chunkStore.upsert({
        id: "c-1",
        documentId: docId,
        organizationId: orgId,
        stage: "planning",
        chunkIndex: 0,
        chunkKey: "planning",
        status: "completed",
        attempts: 1,
        deletedAt: null,
        payload: { contentPlan: { sessions: [{ index: 0 }, { index: 1 }] } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const progress = await queryService.getGenerationProgress(docId, orgId, ["lesson", "flashcard", "quiz", "review_summary"]);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(8); // 1 planning + 2 sessions * 3 stages + 1 review_summary
    });
  });

  // eslint-disable-next-line no-secrets/no-secrets
  describe("isDocumentActivelyWorking", () => {
    it("returns false when no active worker is registered", async () => {
      const isWorking = await queryService.isDocumentActivelyWorking(docId, orgId);
      expect(isWorking).toBe(false);
    });

    it("returns true when a running chunk with valid lease exists", async () => {
      await chunkStore.upsert({
        id: "c-running",
        documentId: docId,
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

      const isWorking = await queryService.isDocumentActivelyWorking(docId, orgId);
      expect(isWorking).toBe(true);
    });
  });

  describe("getDocumentGenerationProgress", () => {
    it("returns document metadata and progress resource for owner", async () => {
      const result = await queryService.getDocumentGenerationProgress(actor, orgId, docId);
      expect(result.documentId).toBe(docId);
      expect(result.documentName).toBe("pharmacology.pdf");
      expect(result.courseId).toBe("course-1");
      expect(result.generationProgress).toBeDefined();
    });

    it("throws not_found if document is not found", async () => {
      await expect(
        queryService.getDocumentGenerationProgress(actor, orgId, "non-existing" as DocumentId)
      ).rejects.toThrow(/Document not found/);
    });
  });
});
