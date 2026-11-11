/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type DocumentChunkId,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type UserId,
  asDocumentId,
  asPresentationReferenceId,
  DomainError,
} from "@avana/domain";
import {
  InMemoryPresentationReferenceStore,
  InMemoryPresentationProjectStore,
} from "../in-memory-presentation-store.js";
import { InMemoryOrganizationStore } from "../../organizations/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../../learning/test/in-memory-stores.js";
import { PresentationReferenceIntegrationService } from "../reference-integration-service.js";

describe("Phase 2A-2.2: Presentation Reference Integration Layer", () => {
  let referenceStore: InMemoryPresentationReferenceStore;
  let projectStore: InMemoryPresentationProjectStore;
  let orgStore: InMemoryOrganizationStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let docStore: InMemoryDocumentStore;
  let integrationService: PresentationReferenceIntegrationService;

  const testOrgId = randomUUID() as OrganizationId;
  const otherOrgId = randomUUID() as OrganizationId;
  const ownerUserId = randomUUID() as UserId;
  const strangerUserId = randomUUID() as UserId;
  const adminUserId = randomUUID() as UserId;
  const editorUserId = randomUUID() as UserId;

  const ownerActor: Actor = {
    userId: ownerUserId,
    role: "student",
    memberships: [{ organizationId: testOrgId, role: "student" }],
  };

  const adminActor: Actor = {
    userId: adminUserId,
    role: "organization_admin",
    memberships: [{ organizationId: testOrgId, role: "organization_admin" }],
  };

  const editorActor: Actor = {
    userId: editorUserId,
    role: "course_editor",
    memberships: [{ organizationId: testOrgId, role: "course_editor" }],
  };

  const strangerActor: Actor = {
    userId: strangerUserId,
    role: "student",
    memberships: [{ organizationId: otherOrgId, role: "student" }],
  };

  const platformAdminActor: Actor = {
    userId: adminUserId,
    role: "student",
    globalRole: "platform_admin",
  };

  let testProject: PresentationProjectRecord;

  beforeEach(() => {
    referenceStore = new InMemoryPresentationReferenceStore();
    projectStore = new InMemoryPresentationProjectStore();
    orgStore = new InMemoryOrganizationStore();
    chunkStore = new InMemoryDocumentChunkStore();
    docStore = new InMemoryDocumentStore();

    integrationService = new PresentationReferenceIntegrationService({
      referenceStore,
      projectStore,
      organizationStore: orgStore,
      chunkStore,
      documentStore: docStore,
    });

    const projectId = randomUUID() as PresentationProjectId;
    testProject = {
      id: projectId,
      organizationId: testOrgId,
      ownerUserId,
      title: "Clinical Pharmacology Presentation",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "created",
      currentStage: null,
      totalSlides: 0,
      overallIntroduction: null,
      overallConclusion: null,
      totalEstimatedSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    projectStore.seed(testProject);

    orgStore.createWithAdminMembership({
      organization: {
        id: testOrgId,
        name: "Test Org",
        slug: "test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: testOrgId,
        userId: adminUserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: testOrgId,
      userId: ownerUserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: testOrgId,
      userId: editorUserId,
      role: "course_editor",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "Other Org",
        slug: "other-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: otherOrgId,
        userId: strangerUserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
  });

  function seedDocument(
    docId: DocumentId,
    organizationId: OrganizationId = testOrgId,
    deletedAt: string | null = null,
  ) {
    docStore.insert({
      id: docId,
      organizationId,
      courseId: null,
      ownerUserId,
      originalName: "Clinical_Doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "hash123",
      storageKey: "storage/key",
      pageCount: 50,
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt,
    });
  }

  // -------------------------------------------------------------------------
  // 1. Document-Backed References Resolution (Zero-Duplication Invariant)
  // -------------------------------------------------------------------------

  it("resolves document-backed references from stored document_chunks without re-chunking", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);

    // Seed canonical document_chunks in store
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "1. Pharmacokinetics",
      content: "Absorption and bioavailability of amoxicillin following oral administration.",
      startPage: 45,
      endPage: 46,
      tokenEstimate: 12,
      contentHash: "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
      createdAt: new Date().toISOString(),
    });

    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 1,
      heading: "2. Elimination Half-Life",
      content: "Elimination occurs primarily via renal clearance with mean half-life of 1.2 hours.",
      startPage: 47,
      endPage: 47,
      tokenEstimate: 15,
      contentHash: "b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12",
      createdAt: new Date().toISOString(),
    });

    // Create presentation reference backed by this document
    const ref = await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Principles of Clinical Pharmacology",
      documentId: docId,
      bibliographicMetadata: {
        authors: ["Brunton, L.", "Hilal-Dandan, R."],
        year: 2022,
      },
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(chunks).toHaveLength(2);

    // Verify first chunk
    expect(chunks[0].provenance).toBe("stored_document_chunk");
    expect(chunks[0].source.referenceId).toBe(ref.id);
    expect(chunks[0].source.citationLabel).toBe("[1] Brunton & Hilal-Dandan (2022)");
    expect(chunks[0].location.startPage).toBe(45);
    expect(chunks[0].location.endPage).toBe(46);
    expect(chunks[0].location.confidence).toBe("exact");
    expect(chunks[0].chunk.content).toContain("Absorption and bioavailability");
    expect(chunks[0].chunk.headingPath).toEqual(["1. Pharmacokinetics"]);
    expect(chunks[0].id).toBe(
      `refchunk_${ref.id}_0_a1b2c3d4`,
    );

    // Verify second chunk
    expect(chunks[1].provenance).toBe("stored_document_chunk");
    expect(chunks[1].location.startPage).toBe(47);
    expect(chunks[1].location.endPage).toBe(47);
    expect(chunks[1].location.confidence).toBe("exact");
    expect(chunks[1].id).toBe(
      `refchunk_${ref.id}_1_b2c3d4e5`,
    );
  });

  // -------------------------------------------------------------------------
  // 2. Direct/External References (Text, PubMed, DOI) & Anti-Hallucination
  // -------------------------------------------------------------------------

  it("chunks direct text references on-the-fly and guarantees null pages with confidence 'unknown'", async () => {
    const textContent = `
# بخش اول: نکات بالینی
داروی آزیترومایسین با دوز 500 mg q.d. تجویز می‌شود.

# بخش دوم: موارد احتیاط
در بیماران با نارسایی قلبی با احتیاط مصرف شود.
`.trim();

    const ref = await referenceStore.create({
      projectId: testProject.id,
      type: "text",
      title: "پروتکل تجویز آنتی‌بیوتیک",
      extractedContent: textContent,
      bibliographicMetadata: {
        authors: ["دکتر رضایی"],
        year: 1403,
      },
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (const chunk of chunks) {
      expect(chunk.provenance).toBe("derived_semantic_chunk");
      expect(chunk.source.referenceId).toBe(ref.id);
      expect(chunk.source.citationLabel).toBe("[1] رضایی (1403)");
      // Anti-hallucination guarantee: unpaged sources MUST NOT fabricate page numbers
      expect(chunk.location.startPage).toBeNull();
      expect(chunk.location.endPage).toBeNull();
      expect(chunk.location.confidence).toBe("unknown");
      expect(chunk.id.startsWith(`refchunk_${ref.id}_`)).toBe(true);
    }

    expect(chunks[0].chunk.headingPath).toEqual(["بخش اول: نکات بالینی"]);
    expect(chunks[1].chunk.headingPath).toEqual(["بخش دوم: موارد احتیاط"]);
  });

  // -------------------------------------------------------------------------
  // 3. PubMed Reference Resolution using Abstract
  // -------------------------------------------------------------------------

  it("resolves PubMed reference using abstract when extractedContent is not explicitly provided", async () => {
    const ref = await referenceStore.create({
      projectId: testProject.id,
      type: "pubmed",
      title: "Efficacy of novel GLP-1 receptor agonists in type 2 diabetes",
      sourceIdentifier: "38123456",
      bibliographicMetadata: {
        authors: ["Smith, John", "Taylor, Anna", "Williams, Robert"],
        year: 2024,
        journal: "Lancet Diabetes Endocrinol",
        abstract: "GLP-1 receptor agonists demonstrated significant HbA1c reduction across randomized trials. Adverse events were predominantly gastrointestinal and mild.",
      },
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].provenance).toBe("derived_semantic_chunk");
    expect(chunks[0].source.referenceId).toBe(ref.id);
    expect(chunks[0].source.citationLabel).toBe("[1] Smith et al. (2024)");
    expect(chunks[0].chunk.content).toContain("GLP-1 receptor agonists demonstrated");
    expect(chunks[0].location.startPage).toBeNull();
    expect(chunks[0].location.confidence).toBe("unknown");
  });

  // -------------------------------------------------------------------------
  // 4. Mixed Project References (Document + Direct Text + PubMed)
  // -------------------------------------------------------------------------

  it("handles multi-source mixed reference projects with consistent citation numbering", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Intro",
      content: "Document introduction chapter text.",
      startPage: 1,
      endPage: 2,
      tokenEstimate: 10,
      contentHash: "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
      createdAt: new Date().toISOString(),
    });

    const ref1 = await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Clinical Handbook",
      documentId: docId,
      bibliographicMetadata: { authors: ["Miller, A."], year: 2023 },
    });

    const ref2 = await referenceStore.create({
      projectId: testProject.id,
      type: "text",
      title: "Department Guidelines",
      extractedContent: "Official guidelines for patient monitoring in critical care.",
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(chunks).toHaveLength(2);

    expect(chunks[0].source.referenceId).toBe(ref1.id);
    expect(chunks[0].source.citationLabel).toBe("[1] Miller (2023)");
    expect(chunks[0].provenance).toBe("stored_document_chunk");
    expect(chunks[0].location.startPage).toBe(1);

    expect(chunks[1].source.referenceId).toBe(ref2.id);
    expect(chunks[1].source.citationLabel).toBe("[2] Department Guidelines");
    expect(chunks[1].provenance).toBe("derived_semantic_chunk");
    expect(chunks[1].location.startPage).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. Citation Grounding Verification
  // -------------------------------------------------------------------------

  it("verifies citation grounding and detects hallucinated or cross-project chunk IDs", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Overview",
      content: "Valid grounded content for pharmacology.",
      startPage: 10,
      endPage: 10,
      tokenEstimate: 8,
      contentHash: "ccccdddd1111222233334444555566667777888899990000aaaabbbbccccdddd",
      createdAt: new Date().toISOString(),
    });

    const ref = await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Valid Reference Book",
      documentId: docId,
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );
    expect(chunks).toHaveLength(1);
    const validChunkId = chunks[0].id;

    // Case A: Strictly valid chunk IDs
    const resA = await integrationService.verifyCitationGrounding(
      ownerActor,
      testProject.id,
      [validChunkId],
      chunks,
    );
    expect(resA.valid).toBe(true);
    expect(resA.validChunkIds).toEqual([validChunkId]);
    expect(resA.invalidChunkIds).toEqual([]);
    expect(resA.groundedReferences).toHaveLength(1);
    expect(resA.groundedReferences[0].referenceId).toBe(ref.id);

    // Case B: Hallucinated / fake chunk ID
    const fakeChunkId = "refchunk_fake-ref-id_99_deadbeef";
    const resB = await integrationService.verifyCitationGrounding(
      ownerActor,
      testProject.id,
      [validChunkId, fakeChunkId],
      chunks,
    );
    expect(resB.valid).toBe(false);
    expect(resB.validChunkIds).toEqual([validChunkId]);
    expect(resB.invalidChunkIds).toEqual([fakeChunkId]);
    expect(resB.groundedReferences).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 6. Project Reference Summary
  // -------------------------------------------------------------------------

  it("computes accurate project reference summary statistics", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Section A",
      content: "Document chunk content text.",
      startPage: 5,
      endPage: 6,
      tokenEstimate: 20,
      contentHash: "1234123412341234123412341234123412341234123412341234123412341234",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Doc Ref",
      documentId: docId,
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "text",
      title: "Text Ref",
      extractedContent: "Short note on medical procedure.",
    });

    const summary = await integrationService.getProjectReferenceSummary(
      ownerActor,
      testProject.id,
    );

    expect(summary.totalReferences).toBe(2);
    expect(summary.totalChunks).toBe(2);
    expect(summary.storedDocumentChunks).toBe(1);
    expect(summary.derivedSemanticChunks).toBe(1);
    expect(summary.totalTokenEstimate).toBeGreaterThan(20);
  });

  // -------------------------------------------------------------------------
  // 7. Multi-Tenant Authorization Rules
  // -------------------------------------------------------------------------

  it("enforces multi-tenant authorization and protects private projects", async () => {
    // 1. Stranger user from different organization -> not_found (non-disclosing)
    await expect(
      integrationService.resolveProjectChunks(strangerActor, testProject.id),
    ).rejects.toThrow(DomainError);

    // 2. Organization admin within same org -> authorized
    const adminChunks = await integrationService.resolveProjectChunks(
      adminActor,
      testProject.id,
    );
    expect(adminChunks).toEqual([]);

    // 3. Course editor within same org -> authorized for read
    const editorChunks = await integrationService.resolveProjectChunks(
      editorActor,
      testProject.id,
    );
    expect(editorChunks).toEqual([]);

    // 4. Platform admin -> authorized
    const platChunks = await integrationService.resolveProjectChunks(
      platformAdminActor,
      testProject.id,
    );
    expect(platChunks).toEqual([]);

    // 5. Soft-deleted project -> not_found
    const deletedProjectId = randomUUID() as PresentationProjectId;
    const deletedProject: PresentationProjectRecord = {
      ...testProject,
      id: deletedProjectId,
      deletedAt: new Date().toISOString(),
    };
    projectStore.seed(deletedProject);
    await expect(
      integrationService.resolveProjectChunks(ownerActor, deletedProjectId),
    ).rejects.toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // 8. 20-Iteration Determinism Regression Test
  // -------------------------------------------------------------------------

  it("guarantees 100% deep equality across 20 consecutive resolution runs", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Cardiology",
      content: "Beta-blocker indications in ischemic heart disease.",
      startPage: 120,
      endPage: 121,
      tokenEstimate: 14,
      contentHash: "abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Cardiology Reference",
      documentId: docId,
      bibliographicMetadata: { authors: ["Zipes, D."], year: 2021 },
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "text",
      title: "Clinical Practice Notes",
      extractedContent: "Patient prescribed metoprolol 25 mg b.i.d. With food. Dr. Miller noted no adverse effects.",
    });

    const firstRun = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(firstRun.length).toBeGreaterThan(1);

    for (let iter = 1; iter <= 20; iter++) {
      const currentRun = await integrationService.resolveProjectChunks(
        ownerActor,
        testProject.id,
      );
      expect(currentRun).toEqual(firstRun);
      expect(currentRun.map((c) => c.id)).toEqual(firstRun.map((c) => c.id));
      expect(currentRun.map((c) => c.chunk.contentHash)).toEqual(
        firstRun.map((c) => c.chunk.contentHash),
      );
    }
  });

  // -------------------------------------------------------------------------
  // 9. ISS-02: Source Location Confidence Discrimination
  // -------------------------------------------------------------------------

  it("assigns confidence 'exact' to PDF documents and 'approximate' to DOCX documents", async () => {
    const pdfDocId = asDocumentId(randomUUID());
    seedDocument(pdfDocId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: pdfDocId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "PDF Chapter",
      content: "Physical page layout content.",
      startPage: 10,
      endPage: 11,
      tokenEstimate: 10,
      contentHash: "1111111111111111111111111111111111111111111111111111111111111111",
      createdAt: new Date().toISOString(),
    });

    const docxDocId = asDocumentId(randomUUID());
    seedDocument(docxDocId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docxDocId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "DOCX Chapter",
      content: "Logical flow document content.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 10,
      contentHash: "2222222222222222222222222222222222222222222222222222222222222222",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "PDF Textbook",
      documentId: pdfDocId,
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "docx",
      title: "DOCX Protocol",
      documentId: docxDocId,
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "text",
      title: "Direct Text Protocol",
      extractedContent: "Direct unpaged clinical observation text.",
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    expect(chunks).toHaveLength(3);

    // PDF chunk has exact physical page location
    expect(chunks[0].source.sourceType).toBe("pdf");
    expect(chunks[0].location.confidence).toBe("exact");
    expect(chunks[0].location.startPage).toBe(10);

    // DOCX chunk has approximate/logical pagination
    expect(chunks[1].source.sourceType).toBe("docx");
    expect(chunks[1].location.confidence).toBe("approximate");
    expect(chunks[1].location.startPage).toBe(1);

    // Direct text has unknown pagination with null pages
    expect(chunks[2].source.sourceType).toBe("text");
    expect(chunks[2].location.confidence).toBe("unknown");
    expect(chunks[2].location.startPage).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 10. ISS-01: Access Control & Foreign Chunk Injection in verifyCitationGrounding
  // -------------------------------------------------------------------------

  it("strictly enforces access control and rejects foreign chunk injection even when preloadedChunks is supplied", async () => {
    const docId = asDocumentId(randomUUID());
    seedDocument(docId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Valid Doc",
      content: "Valid project reference chunk.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 8,
      contentHash: "3333333333333333333333333333333333333333333333333333333333333333",
      createdAt: new Date().toISOString(),
    });

    const ref = await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Local Project Ref",
      documentId: docId,
    });

    const validChunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );
    expect(validChunks).toHaveLength(1);
    const validChunkId = validChunks[0].id;

    // 1. Stranger actor calling verifyCitationGrounding with preloadedChunks must fail authorization
    await expect(
      integrationService.verifyCitationGrounding(
        strangerActor,
        testProject.id,
        [validChunkId],
        validChunks,
      ),
    ).rejects.toThrow(DomainError);

    // 2. Synthesize a foreign chunk belonging to an alien reference
    const foreignRefId = asPresentationReferenceId(randomUUID());
    const foreignChunk: (typeof validChunks)[0] = {
      ...validChunks[0],
      id: `refchunk_${foreignRefId}_0_deadbeef`,
      source: {
        ...validChunks[0].source,
        referenceId: foreignRefId,
      },
    };

    // Preloaded array contains valid chunk + injected foreign chunk
    const mixedPreloaded = [validChunks[0], foreignChunk];

    const result = await integrationService.verifyCitationGrounding(
      ownerActor,
      testProject.id,
      [validChunkId, foreignChunk.id],
      mixedPreloaded,
    );

    // Foreign chunk must be rejected because its referenceId does not belong to this project's active references
    expect(result.valid).toBe(false);
    expect(result.validChunkIds).toEqual([validChunkId]);
    expect(result.invalidChunkIds).toEqual([foreignChunk.id]);
    expect(result.groundedReferences).toHaveLength(1);
    expect(result.groundedReferences[0].referenceId).toBe(ref.id);
  });

  // -------------------------------------------------------------------------
  // 11. ISS-03: Multi-Tenancy Defense-in-Depth in resolveProjectChunks
  // -------------------------------------------------------------------------

  it("excludes document chunks or references belonging to other organizations or deleted documents", async () => {
    // 1. Foreign organization chunk inside same documentId (data corruption scenario)
    const docId1 = asDocumentId(randomUUID());
    seedDocument(docId1, testOrgId);

    // Valid chunk in same org
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId1,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Allowed",
      content: "Allowed chunk in same org.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 6,
      contentHash: "4444444444444444444444444444444444444444444444444444444444444444",
      createdAt: new Date().toISOString(),
    });

    // Foreign chunk with otherOrgId
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId1,
      organizationId: otherOrgId,
      sequence: 1,
      heading: "Forbidden",
      content: "Forbidden alien chunk.",
      startPage: 2,
      endPage: 2,
      tokenEstimate: 6,
      contentHash: "5555555555555555555555555555555555555555555555555555555555555555",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Mixed Org Chunks Doc",
      documentId: docId1,
    });

    // 2. Document belonging to other organization in docStore
    const docId2 = asDocumentId(randomUUID());
    seedDocument(docId2, otherOrgId);
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId2,
      organizationId: otherOrgId,
      sequence: 0,
      heading: "Alien Doc",
      content: "Content from alien org document.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 6,
      contentHash: "6666666666666666666666666666666666666666666666666666666666666666",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Alien Org Reference",
      documentId: docId2,
    });

    // 3. Soft-deleted document in docStore
    const docId3 = asDocumentId(randomUUID());
    seedDocument(docId3, testOrgId, new Date().toISOString());
    chunkStore.insert({
      id: randomUUID() as DocumentChunkId,
      documentId: docId3,
      organizationId: testOrgId,
      sequence: 0,
      heading: "Deleted Doc",
      content: "Content from deleted document.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 6,
      contentHash: "7777777777777777777777777777777777777777777777777777777777777777",
      createdAt: new Date().toISOString(),
    });

    await referenceStore.create({
      projectId: testProject.id,
      type: "pdf",
      title: "Deleted Reference",
      documentId: docId3,
    });

    const chunks = await integrationService.resolveProjectChunks(
      ownerActor,
      testProject.id,
    );

    // Only the single allowed chunk from docId1 with testOrgId should be returned!
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunk.content).toBe("Allowed chunk in same org.");
    expect(chunks[0].location.confidence).toBe("exact");
  });
});
