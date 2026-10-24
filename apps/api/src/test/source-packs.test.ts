import { describe, it, expect, beforeEach } from "vitest";
import {
  asCourseId,
  asDocumentId,
  asGenerationJobId,
  asOrganizationId,
  asUserId,
} from "@avana/domain";
import type { SourcePackDocumentItem } from "@avana/contracts";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { sourcePackRoutes } from "../modules/source-packs/source-pack-routes.js";
import { SourcePackService } from "../modules/source-packs/source-pack-service.js";
import { InMemorySourcePackStore } from "../modules/source-packs/in-memory-source-pack-store.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import type { CourseStore, CourseRecord } from "../modules/courses/course-store.js";
import type { DocumentStore, DocumentRecord } from "../modules/learning/learning-store.js";
import type {
  GenerationQueue,
  GenerationJobPayload,
} from "../modules/generation/generation-queue.js";

describe("Source Packs API & Domain Invariants", () => {
  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
  const courseId = asCourseId("00000000-0000-0000-0000-000000000002");
  const otherCourseId = asCourseId("00000000-0000-0000-0000-000000000098");
  const userId = asUserId("00000000-0000-0000-0000-000000000003");

  const doc1Id = asDocumentId("00000000-0000-0000-0000-000000000011");
  const doc2Id = asDocumentId("00000000-0000-0000-0000-000000000012");
  const doc3Id = asDocumentId("00000000-0000-0000-0000-000000000013");
  const foreignDocId = asDocumentId("00000000-0000-0000-0000-000000000014");

  let packStore: InMemorySourcePackStore;
  let mockDocs: Map<string, DocumentRecord>;
  let mockCourses: Map<string, CourseRecord>;
  let mockDocumentStore: DocumentStore;
  let mockCourseStore: CourseStore;
  let enqueuedJobs: GenerationJobPayload[];
  let service: SourcePackService;
  let app: ReturnType<typeof createApp>;
  let sessionCookie: string;

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
          originalName: "Doc 1.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "hash1",
          storageKey: "key1",
          pageCount: 5,
          status: "ready",
          errorCode: null,
          retryCount: 0,
          qualityScore: null,
          qualityLevel: null,
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
          originalName: "Doc 2.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          sha256: "hash2",
          storageKey: "key2",
          pageCount: 10,
          status: "extracted",
          errorCode: null,
          retryCount: 0,
          qualityScore: null,
          qualityLevel: null,
          qualityReport: null,
          qualityAnalyzedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
      ],
      [
        doc3Id,
        {
          id: doc3Id,
          organizationId: orgId,
          courseId,
          ownerUserId: userId,
          originalName: "Doc 3.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
          sha256: "hash3",
          storageKey: "key3",
          pageCount: 15,
          status: "extracted",
          errorCode: null,
          retryCount: 0,
          qualityScore: null,
          qualityLevel: null,
          qualityReport: null,
          qualityAnalyzedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
      ],
      [
        foreignDocId,
        {
          id: foreignDocId,
          organizationId: orgId,
          courseId: otherCourseId,
          ownerUserId: userId,
          originalName: "Foreign Doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          sha256: "hash4",
          storageKey: "key4",
          pageCount: 2,
          status: "ready",
          errorCode: null,
          retryCount: 0,
          qualityScore: null,
          qualityLevel: null,
          qualityReport: null,
          qualityAnalyzedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
      ],
    ]);

    mockCourses = new Map<string, CourseRecord>([
      [
        courseId,
        {
          id: courseId,
          organizationId: orgId,
          name: "Test Course",
          subject: null,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
      ],
    ]);

    mockDocumentStore = {
      findById: async (id) => mockDocs.get(id),
      findByIdForOrganization: async (id, org) => {
        const doc = mockDocs.get(id);
        return doc && doc.organizationId === org ? doc : undefined;
      },
      findByIdForOwner: async (id, org, owner) => {
        const doc = mockDocs.get(id);
        return doc && doc.organizationId === org && doc.ownerUserId === owner ? doc : undefined;
      },
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

    packStore = new InMemorySourcePackStore(mockDocumentStore);
    enqueuedJobs = [];
    const mockGenerationQueue: GenerationQueue = {
      enqueueGenerationJob: async (payload) => {
        enqueuedJobs.push(payload);
        return {
          generationJobId: asGenerationJobId(payload.jobId ?? "00000000-0000-0000-0000-000000000099"),
          jobId: "bull-job-1",
          status: "queued",
        };
      },
    };

    service = new SourcePackService({
      store: packStore,
      documentStore: mockDocumentStore,
      courseStore: mockCourseStore,
      generationQueue: mockGenerationQueue,
    });

    const userStore = new InMemoryUserStore();
    const createdUser = await userStore.createUserWithPassword({
      email: "test@avana.test",
      passwordHash: "hash",
      name: "Test User",
      globalRole: "student",
    });

    const sessionStore = new InMemorySessionStore();
    const sessionService = new SessionService(sessionStore, config.session);
    const session = await sessionService.createSession(createdUser.id);
    sessionCookie = session.sessionToken;

    app = createApp({ config });
    await app.register(sourcePackRoutes, {
      service,
      sessionService,
      userStore,
    });
  });

  it("creates a Source Pack with 1 primary and multiple supplementary documents", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "فصل دوم - شیمی آلی",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: doc2Id, role: "supplementary" },
          { document_id: doc3Id, role: "supplementary" },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.source_pack.title).toBe("فصل دوم - شیمی آلی");
    expect(body.source_pack.documents).toHaveLength(3);

    const primary = body.source_pack.documents.find((d: SourcePackDocumentItem) => d.role === "primary_notes");
    expect(primary).toBeDefined();
    expect(primary.document_id).toBe(doc1Id);
    expect(primary.order_index).toBe(0);

    const supplementaries = body.source_pack.documents.filter((d: SourcePackDocumentItem) => d.role === "supplementary_reference");
    expect(supplementaries).toHaveLength(2);
    expect(supplementaries[0].order_index).toBe(1);
    expect(supplementaries[1].order_index).toBe(2);
  });

  it("automatically assigns the first document as PRIMARY if no role is explicitly passed", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک بدون نقش پیش‌فرض",
        documents: [
          { document_id: doc2Id },
          { document_id: doc3Id },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.source_pack.documents[0].document_id).toBe(doc2Id);
    expect(body.source_pack.documents[0].role).toBe("primary_notes");
    expect(body.source_pack.documents[0].order_index).toBe(0);

    expect(body.source_pack.documents[1].document_id).toBe(doc3Id);
    expect(body.source_pack.documents[1].role).toBe("supplementary_reference");
    expect(body.source_pack.documents[1].order_index).toBe(1);
  });

  it("rejects creating a pack with more than 1 primary document", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک با دو منبع اصلی غیرمجاز",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: doc2Id, role: "primary" },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("A source pack cannot have more than 1 primary document");
  });

  it("rejects duplicate documents in the same pack", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک با تکرار فایل",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: doc1Id, role: "supplementary" },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("Duplicate document detected in source pack");
  });

  it("rejects documents from a different course (cross-course leakage guard)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک با سند خارج از درس",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: foreignDocId, role: "supplementary" },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("does not belong to this course");
  });

  it("allows updating a pack: changing title and promoting another document to PRIMARY", async () => {
    // 1. Create initial pack
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "عنوان اولیه",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: doc2Id, role: "supplementary" },
        ],
      },
    });
    const packId = JSON.parse(createRes.body).source_pack.id;

    // 2. Patch: Make doc2 primary and doc1 supplementary
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "عنوان اصلاح‌شده",
        documents: [
          { document_id: doc2Id, role: "primary" },
          { document_id: doc1Id, role: "supplementary" },
        ],
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = JSON.parse(patchRes.body);
    expect(body.source_pack.title).toBe("عنوان اصلاح‌شده");

    const newPrimary = body.source_pack.documents.find((d: SourcePackDocumentItem) => d.role === "primary_notes");
    expect(newPrimary.document_id).toBe(doc2Id);
    expect(newPrimary.order_index).toBe(0);

    const newSupplementary = body.source_pack.documents.find((d: SourcePackDocumentItem) => d.role === "supplementary_reference");
    expect(newSupplementary.document_id).toBe(doc1Id);
    expect(newSupplementary.order_index).toBe(1);
  });

  it("lists packs filtered by course", async () => {
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک ۱",
        documents: [{ document_id: doc1Id, role: "primary" }],
      },
    });

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک ۲",
        documents: [{ document_id: doc2Id, role: "primary" }],
      },
    });

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
    });

    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.source_packs).toHaveLength(2);
  });

  it("deletes a pack cleanly", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک برای حذف",
        documents: [{ document_id: doc1Id, role: "primary" }],
      },
    });
    const packId = JSON.parse(createRes.body).source_pack.id;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}`,
      headers: { authorization: `Bearer ${sessionCookie}` },
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}`,
      headers: { authorization: `Bearer ${sessionCookie}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("rejects generating unified content if pack contains less than 2 documents", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک تک‌سندی",
        documents: [{ document_id: doc1Id, role: "primary" }],
      },
    });
    const packId = JSON.parse(createRes.body).source_pack.id;

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}/generate`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        types: ["lesson", "flashcard"],
      },
    });

    expect(genRes.statusCode).toBe(400);
    const body = JSON.parse(genRes.body);
    expect(body.error.message).toContain("نیازمند حداقل ۲ سند است");
  });

  it("rejects generating unified content if any pack document is not ready or extracted", async () => {
    // Put doc2 in 'uploaded' status (not extracted yet)
    const doc2 = mockDocs.get(doc2Id)!;
    mockDocs.set(doc2Id, { ...doc2, status: "uploaded" });

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک شامل سند در حال پردازش",
        documents: [
          { document_id: doc1Id, role: "primary" },
          { document_id: doc2Id, role: "supplementary" },
        ],
      },
    });
    const packId = JSON.parse(createRes.body).source_pack.id;

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}/generate`,
      headers: { authorization: `Bearer ${sessionCookie}` },
    });

    expect(genRes.statusCode).toBe(409);
    const body = JSON.parse(genRes.body);
    expect(body.error.message).toContain("هنوز برای تولید محتوا آماده نیست");
  });

  it("successfully triggers unified multi-source generation from a Source Pack", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک زیست‌شناسی - ژنتیک",
        documents: [
          // Order them arbitrarily; primary is doc2
          { document_id: doc1Id, role: "supplementary" },
          { document_id: doc2Id, role: "primary" },
          { document_id: doc3Id, role: "supplementary" },
        ],
      },
    });
    const packId = JSON.parse(createRes.body).source_pack.id;

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${packId}/generate`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        types: ["lesson", "quiz"],
      },
    });

    expect(genRes.statusCode).toBe(202);
    const body = JSON.parse(genRes.body);
    expect(body.status).toBe("queued");
    expect(body.job_id).toBeDefined();

    // Verify queue payload adheres strictly to multi-source invariants
    expect(enqueuedJobs).toHaveLength(1);
    const queuedPayload = enqueuedJobs[0];

    // 1. generation_jobs.document_id points to PRIMARY document
    expect(queuedPayload.documentId).toBe(doc2Id);

    // 2. sources snapshot is ordered with primary at order 0, supplementaries following
    expect(queuedPayload.sources).toBeDefined();
    expect(queuedPayload.sources).toHaveLength(3);
    expect(queuedPayload.sources![0]).toEqual({ documentId: doc2Id, order: 0, role: "primary_notes" });
    expect(queuedPayload.sources![1].order).toBe(1);
    expect(queuedPayload.sources![1].role).toBe("supplementary_reference");
    expect(queuedPayload.sources![2].order).toBe(2);
    expect(queuedPayload.sources![2].role).toBe("supplementary_reference");

    // 3. Types and context
    expect(queuedPayload.types).toEqual(["lesson", "quiz"]);
  });

  it("supports granular semantic roles and preserves them in generation snapshot", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "پک ریاضی با قالب سوالات و رفرنس اصلی",
        documents: [
          { document_id: doc1Id, role: "primary_notes" },
          { document_id: doc2Id, role: "question_template" },
          { document_id: doc3Id, role: "primary_reference" },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const pack = JSON.parse(createRes.body).source_pack;
    expect(pack.documents).toHaveLength(3);
    expect(pack.documents[0].role).toBe("primary_notes");
    expect(pack.documents[1].role).toBe("question_template");
    expect(pack.documents[2].role).toBe("primary_reference");

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${pack.id}/generate`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        types: ["quiz"],
      },
    });

    expect(genRes.statusCode).toBe(202);
    expect(enqueuedJobs).toHaveLength(1);
    const queuedPayload = enqueuedJobs[0];
    expect(queuedPayload.documentId).toBe(doc1Id);
    expect(queuedPayload.sources).toEqual([
      { documentId: doc1Id, order: 0, role: "primary_notes" },
      { documentId: doc2Id, order: 1, role: "question_template" },
      { documentId: doc3Id, order: 2, role: "primary_reference" },
    ]);
  });

  it("enforces single primary_notes, single question_template, and single primary_reference constraints", async () => {
    // 1. Multiple primary_notes
    const dupPrimary = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "تست خطا",
        documents: [
          { document_id: doc1Id, role: "primary_notes" },
          { document_id: doc2Id, role: "primary_notes" },
        ],
      },
    });
    expect(dupPrimary.statusCode).toBe(400);

    // 2. Multiple question_template
    const dupTemplate = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "تست خطا قالب",
        documents: [
          { document_id: doc1Id, role: "primary_notes" },
          { document_id: doc2Id, role: "question_template" },
          { document_id: doc3Id, role: "question_template" },
        ],
      },
    });
    expect(dupTemplate.statusCode).toBe(400);

    // 3. Multiple primary_reference
    const dupRef = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: { authorization: `Bearer ${sessionCookie}` },
      payload: {
        title: "تست خطا رفرنس",
        documents: [
          { document_id: doc1Id, role: "primary_notes" },
          { document_id: doc2Id, role: "primary_reference" },
          { document_id: doc3Id, role: "primary_reference" },
        ],
      },
    });
    expect(dupRef.statusCode).toBe(400);
  });
});
