import { describe, expect, it, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GenerationJobId,
  type OrgMembershipId,
  type UserId,
  RoleBasedPolicy,
  DomainError,
  normalizeGenerationSources,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { generationRoutes } from "../modules/generation/generation-routes.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import type { DocumentRecord, DocumentChunkRecord } from "../modules/learning/learning-store.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

function makeDoc(
  id: DocumentId,
  orgId: OrganizationId,
  courseId: CourseId,
  name: string,
  status: DocumentRecord["status"] = "extracted",
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    organizationId: orgId,
    courseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: name,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: `hash-${id}`.padEnd(64, "0"),
    storageKey: `uploads/${id}.pdf`,
    pageCount: 5,
    status,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    qualityScore: 90,
    qualityLevel: "high",
    qualityReport: null,
    qualityAnalyzedAt: now,
  };
}

function makeDocChunks(
  docId: DocumentId,
  orgId: OrganizationId,
  count = 2,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID() as DocumentChunkRecord["id"],
    documentId: docId,
    organizationId: orgId,
    sequence: i + 1,
    heading: `Section ${i + 1} of ${docId.slice(0, 8)}`,
    content: `Content details for chunk ${i + 1} in document ${docId}. Detailed educational explanations and pharmacology mechanisms.`,
    startPage: i + 1,
    endPage: i + 1,
    tokenEstimate: 120,
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

describe("Multi-Source Unified Content Generation", () => {
  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "course_editor",
  };
  const orgId = randomUUID() as OrganizationId;
  const courseId = randomUUID() as CourseId;

  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: GenerationService;

  beforeEach(() => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    service = new GenerationService(
      contentStore,
      citationStore,
      new MockModelGateway(),
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
      jobStore,
    );
  });

  describe("normalizeGenerationSources", () => {
    it("enforces 2-10 sources and eliminates duplicate document IDs", () => {
      const doc1 = randomUUID() as DocumentId;
      const doc2 = randomUUID() as DocumentId;
      const doc3 = randomUUID() as DocumentId;

      expect(() => normalizeGenerationSources([{ documentId: doc1, order: 0 }])).toThrow(DomainError);
      expect(() => normalizeGenerationSources([])).toThrow(DomainError);
      expect(() =>
        normalizeGenerationSources([
          { documentId: doc1, order: 0 },
          { documentId: doc1, order: 1 },
        ]),
      ).toThrow("تکراری");

      const normalized = normalizeGenerationSources([
        { documentId: doc2, order: 10 },
        { documentId: doc1, order: 1 },
        { documentId: doc3, order: 5 },
      ]);

      expect(normalized).toHaveLength(3);
      expect(normalized[0].documentId).toBe(doc1);
      expect(normalized[0].order).toBe(0);
      expect(normalized[1].documentId).toBe(doc3);
      expect(normalized[1].order).toBe(1);
      expect(normalized[2].documentId).toBe(doc2);
      expect(normalized[2].order).toBe(2);
    });
  });

  describe("Multi-source job store persistence", () => {
    it("persists and retrieves sources in GenerationJobStore", async () => {
      const jobId = randomUUID() as GenerationJobId;
      const doc1 = randomUUID() as DocumentId;
      const doc2 = randomUUID() as DocumentId;

      await jobStore.create({
        id: jobId,
        organizationId: orgId,
        courseId,
        documentId: doc1,
        type: "multi-source",
        status: "queued",
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await jobStore.addSources([
        { id: randomUUID(), generationJobId: jobId, documentId: doc1, orderIndex: 0, createdAt: new Date().toISOString() },
        { id: randomUUID(), generationJobId: jobId, documentId: doc2, orderIndex: 1, createdAt: new Date().toISOString() },
      ]);

      const sources = await jobStore.listSourcesByJob(jobId);
      expect(sources).toHaveLength(2);
      expect(sources[0].documentId).toBe(doc1);
      expect(sources[0].orderIndex).toBe(0);
      expect(sources[1].documentId).toBe(doc2);
      expect(sources[1].orderIndex).toBe(1);
    });
  });

  describe("Multi-source Generation execution & Citations", () => {
    it("generates unified content referencing chunks across all source documents", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      const doc1 = makeDoc(doc1Id, orgId, courseId, "LectureSlides.pdf");
      const doc2 = makeDoc(doc2Id, orgId, courseId, "ProfNotes.pdf");

      await docStore.create(doc1);
      await docStore.create(doc2);

      const chunks1 = makeDocChunks(doc1Id, orgId, 2);
      const chunks2 = makeDocChunks(doc2Id, orgId, 2);

      await chunkStore.createMany(chunks1);
      await chunkStore.createMany(chunks2);

      const result = await service.generateForDocument(actor, orgId, doc1Id, {
        types: ["lesson", "flashcard"],
        courseId,
        sources: [
          { documentId: doc1Id, order: 0 },
          { documentId: doc2Id, order: 1 },
        ],
      });

      expect(result.document_status).toBe("review_pending");
      expect(result.contents.length).toBeGreaterThanOrEqual(1);

      // Verify both documents transitioned to review_pending
      const updatedDoc1 = await docStore.findByIdForOrganization(doc1Id, orgId);
      const updatedDoc2 = await docStore.findByIdForOrganization(doc2Id, orgId);
      expect(updatedDoc1?.status).toBe("review_pending");
      expect(updatedDoc2?.status).toBe("review_pending");

      // Verify citations are persisted and link to chunks from generated contents
      const contentIds = result.contents.map((c) => c.id);
      const allCitations = await citationStore.listByGeneratedContents(contentIds);
      const citedChunkIds = new Set(allCitations.map((c) => c.documentChunkId));

      const hasDoc1Chunks = chunks1.some((c) => citedChunkIds.has(c.id));
      const hasDoc2Chunks = chunks2.some((c) => citedChunkIds.has(c.id));
      expect(hasDoc1Chunks).toBe(true);
      expect(hasDoc2Chunks).toBe(true);
    });

    it("transitions all sources to failed if generation encounters an error", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      const doc1 = makeDoc(doc1Id, orgId, courseId, "Doc1.pdf");
      const doc2 = makeDoc(doc2Id, orgId, courseId, "Doc2.pdf");

      await docStore.create(doc1);
      await docStore.create(doc2);

      // Neither document has chunks, triggering conflict error
      await expect(
        service.generateForDocument(actor, orgId, doc1Id, {
          courseId,
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
        }),
      ).rejects.toThrow("chunks");

      const updatedDoc1 = await docStore.findByIdForOrganization(doc1Id, orgId);
      const updatedDoc2 = await docStore.findByIdForOrganization(doc2Id, orgId);
      expect(updatedDoc1?.status).toBe("failed");
      expect(updatedDoc2?.status).toBe("failed");
    });
  });

  describe("Backward Compatibility", () => {
    it("single-source generation behaves identically without sources param", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDoc(docId, orgId, courseId, "SingleDoc.pdf");
      await docStore.create(doc);
      const chunks = makeDocChunks(docId, orgId, 2);
      await chunkStore.createMany(chunks);

      const result = await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        courseId,
      });

      expect(result.document_status).toBe("review_pending");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].document_id).toBe(docId);
    });
  });

  describe("Multi-Source HTTP API Routes", () => {
    let apiApp: ReturnType<typeof createApp>;
    let apiDocStore: InMemoryDocumentStore;
    let apiChunkStore: InMemoryDocumentChunkStore;
    let apiJobStore: InMemoryGenerationJobStore;
    let apiQueue: InMemoryGenerationQueue;
    let apiGateway: MockModelGateway;
    let apiOrgStore: InMemoryOrganizationStore;
    let apiUserStore: InMemoryUserStore;
    let apiSessionStore: InMemorySessionStore;
    let apiWalletStore: InMemoryWalletStore;
    let apiWalletService: WalletService;

    let adminUser: { id: UserId; email: string };
    let studentUser: { id: UserId; email: string };
    let adminCookie: string;
    let studentCookie: string;

    beforeEach(async () => {
      process.env.NODE_ENV = "test";
      const config = loadApiConfig();

      apiDocStore = new InMemoryDocumentStore();
      apiChunkStore = new InMemoryDocumentChunkStore();
      apiJobStore = new InMemoryGenerationJobStore();
      apiQueue = new InMemoryGenerationQueue(apiJobStore);
      apiGateway = new MockModelGateway();
      apiOrgStore = new InMemoryOrganizationStore();
      apiUserStore = new InMemoryUserStore();
      apiSessionStore = new InMemorySessionStore();
      apiWalletStore = new InMemoryWalletStore();
      const audit = new AuditService(new InMemoryAuditStore());
      apiWalletService = new WalletService(apiWalletStore, audit);

      adminUser = await apiUserStore.createUserWithPassword({
        email: "admin@avana.test",
        passwordHash: "hash-admin",
        name: "Admin User",
        globalRole: "platform_admin",
      });

      studentUser = await apiUserStore.createUserWithPassword({
        email: "student@avana.test",
        passwordHash: "hash-student",
        name: "Student User",
        globalRole: "student",
      });

      await apiOrgStore.createWithAdminMembership({
        organization: {
          id: orgId,
          name: "Api Test Org",
          slug: "api-test-org",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: `mem-admin-${orgId}` as OrgMembershipId,
          organizationId: orgId,
          userId: adminUser.id,
          role: "admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      await apiOrgStore.addMembership({
        id: `mem-student-${orgId}` as OrgMembershipId,
        organizationId: orgId,
        userId: studentUser.id,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const sessionService = new SessionService(apiSessionStore, config.session);
      const adminSession = await sessionService.createSession(adminUser.id);
      adminCookie = adminSession.sessionToken;

      const studentSession = await sessionService.createSession(studentUser.id);
      studentCookie = studentSession.sessionToken;

      apiApp = createApp({ config });
      await apiApp.register(generationRoutes, {
        sessionService,
        userStore: apiUserStore,
        documentStore: apiDocStore,
        documentChunkStore: apiChunkStore,
        generatedContentStore: new InMemoryGeneratedContentStore(),
        generatedContentCitationStore: new InMemoryGeneratedContentCitationStore(),
        generationJobStore: apiJobStore,
        queue: apiQueue,
        gateway: apiGateway,
        organizationStore: apiOrgStore,
        courseStore: undefined,
        moduleStore: new InMemoryModuleStore(),
        lessonStore: new InMemoryLessonStore(),
        flashcardStore: new InMemoryFlashcardStore(),
        quizStore: new InMemoryQuizStore(),
        quizQuestionStore: new InMemoryQuizQuestionStore(),
        systemOrganizationId: "org-system" as OrganizationId,
        pricingConfig: {
          inputPricePerMillionUsd: 0.14,
          outputPricePerMillionUsd: 0.28,
          usdToTomanRate: 100_000,
        },
        walletService: apiWalletService,
        walletStore: apiWalletStore,
      });
    });

    it("POST /generate accepts 2 valid sources, enqueues with primary doc_id, and records sources", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Source1.pdf"));
      await apiDocStore.create(makeDoc(doc2Id, orgId, courseId, "Source2.pdf"));

      await apiChunkStore.createMany(makeDocChunks(doc1Id, orgId, 2));
      await apiChunkStore.createMany(makeDocChunks(doc2Id, orgId, 2));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
          types: ["lesson"],
        },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.job_id).toBeDefined();
      expect(body.status).toBe("queued");

      const job = await apiJobStore.findByIdForOrganization(body.job_id as GenerationJobId, orgId);
      expect(job).toBeDefined();
      expect(job?.documentId).toBe(doc1Id);

      const sources = await apiJobStore.listSourcesByJob(body.job_id as GenerationJobId);
      expect(sources).toHaveLength(2);
      expect(sources[0].documentId).toBe(doc1Id);
      expect(sources[0].orderIndex).toBe(0);
      expect(sources[1].documentId).toBe(doc2Id);
      expect(sources[1].orderIndex).toBe(1);
    });

    it("POST /generate accepts 3 valid sources and normalizes order to 0..N-1", async () => {
      const docA = randomUUID() as DocumentId;
      const docB = randomUUID() as DocumentId;
      const docC = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(docA, orgId, courseId, "DocA.pdf"));
      await apiDocStore.create(makeDoc(docB, orgId, courseId, "DocB.pdf"));
      await apiDocStore.create(makeDoc(docC, orgId, courseId, "DocC.pdf"));

      await apiChunkStore.createMany(makeDocChunks(docA, orgId, 1));
      await apiChunkStore.createMany(makeDocChunks(docB, orgId, 1));
      await apiChunkStore.createMany(makeDocChunks(docC, orgId, 1));

      // Intentionally scrambled order
      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: docC, order: 10 },
            { documentId: docA, order: 1 },
            { documentId: docB, order: 5 },
          ],
          types: ["lesson"],
        },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      const job = await apiJobStore.findByIdForOrganization(body.job_id as GenerationJobId, orgId);
      expect(job?.documentId).toBe(docA); // docA had lowest order, so it's primary

      const sources = await apiJobStore.listSourcesByJob(body.job_id as GenerationJobId);
      expect(sources).toHaveLength(3);
      expect(sources[0].documentId).toBe(docA);
      expect(sources[0].orderIndex).toBe(0);
      expect(sources[1].documentId).toBe(docB);
      expect(sources[1].orderIndex).toBe(1);
      expect(sources[2].documentId).toBe(docC);
      expect(sources[2].orderIndex).toBe(2);
    });

    it("rejects request with < 2 sources with 400 Bad Request", async () => {
      const doc1Id = randomUUID() as DocumentId;
      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Single.pdf"));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [{ documentId: doc1Id, order: 0 }],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("حداقل ۲ سند");
    });

    it("rejects request with > 10 sources with 400 Bad Request", async () => {
      const sources = Array.from({ length: 11 }, (_, i) => ({
        documentId: randomUUID(),
        order: i,
      }));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("۱۰ سند");
    });

    it("rejects request with duplicate document IDs with 400 Bad Request", async () => {
      const doc1Id = randomUUID() as DocumentId;
      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Dup.pdf"));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc1Id, order: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("تکراری");
    });

    it("rejects cross-organization document with 404 Not Found", async () => {
      const otherOrgId = randomUUID() as OrganizationId;
      const doc1Id = randomUUID() as DocumentId;
      const docOtherOrgId = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(docOtherOrgId, otherOrgId, courseId, "OtherOrg.pdf"));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: docOtherOrgId, order: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it("rejects cross-course document with 400 Bad Request", async () => {
      const otherCourseId = randomUUID() as CourseId;
      const doc1Id = randomUUID() as DocumentId;
      const docOtherCourseId = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(docOtherCourseId, orgId, otherCourseId, "OtherCourse.pdf"));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: docOtherCourseId, order: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("does not belong to this course");
    });

    it("rejects documents in invalid status with 409 Conflict", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const docUnextractedId = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf", "extracted"));
      await apiDocStore.create(makeDoc(docUnextractedId, orgId, courseId, "DocUnextracted.pdf", "uploaded"));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: docUnextractedId, order: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("not in a valid state for generation");
    });

    it("charges public user wallet once for aggregate multi-source generation", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(doc2Id, orgId, courseId, "Doc2.pdf"));

      await apiChunkStore.createMany(makeDocChunks(doc1Id, orgId, 3));
      await apiChunkStore.createMany(makeDocChunks(doc2Id, orgId, 3));

      // Fund student wallet with 100,000 Tomans
      await apiWalletService.credit({
        userId: studentUser.id,
        amount: 100_000,
        source: "deposit",
        referenceType: "payment",
        referenceId: "pay-seed",
        idempotencyKey: "credit-seed",
      });

      const debitSpy = vi.spyOn(apiWalletService, "debit");

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${studentCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
          types: ["lesson"],
        },
      });

      expect(res.statusCode).toBe(202);
      expect(debitSpy).toHaveBeenCalledTimes(1);

      const debitCall = debitSpy.mock.calls[0][0];
      expect(debitCall.userId).toBe(studentUser.id);
      expect(debitCall.amount).toBeGreaterThan(0);
      expect(debitCall.metadata?.sourcesCount).toBe(2);
      expect(debitCall.metadata?.documentId).toBe(doc1Id);
    });

    it("rolls back document reservation if wallet debit fails (insufficient funds)", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(doc2Id, orgId, courseId, "Doc2.pdf"));

      await apiChunkStore.createMany(makeDocChunks(doc1Id, orgId, 2));
      await apiChunkStore.createMany(makeDocChunks(doc2Id, orgId, 2));

      // Student has 0 balance, debit will throw insufficient funds
      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${studentCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
          types: ["lesson"],
        },
      });

      expect(res.statusCode).toBe(402);

      // Verify documents are not stuck in pending_generation
      const doc1 = await apiDocStore.findByIdForOrganization(doc1Id, orgId);
      const doc2 = await apiDocStore.findByIdForOrganization(doc2Id, orgId);
      expect(doc1?.status).toBe("extracted");
      expect(doc2?.status).toBe("extracted");
    });

    it("compensates refund and restores doc status if queue enqueuing fails", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(doc2Id, orgId, courseId, "Doc2.pdf"));

      await apiChunkStore.createMany(makeDocChunks(doc1Id, orgId, 2));
      await apiChunkStore.createMany(makeDocChunks(doc2Id, orgId, 2));

      // Fund student wallet
      await apiWalletService.credit({
        userId: studentUser.id,
        amount: 50_000,
        source: "deposit",
        referenceType: "payment",
        referenceId: "pay-seed-2",
        idempotencyKey: "credit-seed-2",
      });

      const initialWallet = await apiWalletStore.findWalletByUserId(studentUser.id);
      const initialBalance = initialWallet!.balance;

      // Force queue enqueue to fail
      vi.spyOn(apiQueue, "enqueueGenerationJob").mockRejectedValueOnce(
        new Error("Queue broker failure"),
      );

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/generate`,
        headers: {
          authorization: `Bearer ${studentCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
          types: ["lesson"],
        },
      });

      expect(res.statusCode).toBe(500);

      // Verify docs unreserved
      const doc1 = await apiDocStore.findByIdForOrganization(doc1Id, orgId);
      const doc2 = await apiDocStore.findByIdForOrganization(doc2Id, orgId);
      expect(doc1?.status).toBe("extracted");
      expect(doc2?.status).toBe("extracted");

      // Verify wallet was refunded back to initial balance
      const currentWallet = await apiWalletStore.findWalletByUserId(studentUser.id);
      expect(currentWallet?.balance).toBe(initialBalance);
    });

    it("POST /estimate-cost returns aggregate token usage and price for multiple sources", async () => {
      const doc1Id = randomUUID() as DocumentId;
      const doc2Id = randomUUID() as DocumentId;

      await apiDocStore.create(makeDoc(doc1Id, orgId, courseId, "Doc1.pdf"));
      await apiDocStore.create(makeDoc(doc2Id, orgId, courseId, "Doc2.pdf"));

      await apiChunkStore.createMany(makeDocChunks(doc1Id, orgId, 3));
      await apiChunkStore.createMany(makeDocChunks(doc2Id, orgId, 3));

      const res = await apiApp.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/estimate-cost`,
        headers: {
          authorization: `Bearer ${adminCookie}`,
        },
        payload: {
          sources: [
            { documentId: doc1Id, order: 0 },
            { documentId: doc2Id, order: 1 },
          ],
          types: ["lesson", "flashcard"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.estimate?.aiCostEstimate?.estimatedTotalTokens).toBeGreaterThan(0);
      expect(body.estimate?.userPrice).toBeDefined();
      expect(body.estimate?.userPrice.totalPriceToman).toBeGreaterThan(0);
      expect(body.estimate?.estimatedPriceToman).toBeGreaterThan(0);
    });
  });
});
