import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  RoleBasedPolicy,
  type ReviewSummaryPayload,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import { MockModelGateway } from "./gateway/index.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "./test/in-memory-stores.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";
import {
  REVIEW_SUMMARY_SYSTEM_PROMPT,
  buildReviewSummaryUserPrompt,
  getReviewSummaryTemplate,
  getPromptRegistry,
} from "./prompt-registry.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../learning/learning-store.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "cardiology-review.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024 * 1024,
    sha256: "b".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 15,
    status: "extracted", qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  count = 4,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i + 1}` as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `فصل ${i + 1}: مباحث اصلی`,
    content: `محتوای تخصصی داروشناسی و پاتوفیزیولوژی بخش ${i + 1}`,
    startPage: i * 3 + 1,
    endPage: (i + 1) * 3,
    tokenEstimate: 500,
    contentHash: `hash-${i + 1}`,
    createdAt: now,
  }));
}

describe("Review Summary Generation («خلاصه مروری»)", () => {
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: GenerationService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const organizationId = randomUUID() as OrganizationId;

  beforeEach(() => {
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    service = new GenerationService(
      contentStore,
      citationStore,
      new MockModelGateway(),
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );
  });

  it("registers review-summary prompt in Prompt Registry", () => {
    const registry = getPromptRegistry();
    const promptDef = registry.find((p) => p.id === "review-summary");

    expect(promptDef).toBeDefined();
    expect(promptDef?.category).toBe("Review Summary");
    expect(promptDef?.systemPrompt).toBe(REVIEW_SUMMARY_SYSTEM_PROMPT);
    expect(promptDef?.userPrompt).toBe(getReviewSummaryTemplate());
    expect(promptDef?.variables).toContain("targetReadingMinutes");
    expect(promptDef?.variables).toContain("chunkContext");
  });

  it("buildReviewSummaryUserPrompt builds structured high-density prompt with Persian instructions", () => {
    const prompt = buildReviewSummaryUserPrompt({
      docName: "فارماکولوژی قلب.pdf",
      targetReadingMinutes: 12,
      minReadingMinutes: 10,
      maxReadingMinutes: 15,
      chunkContext: "[CHUNK 1] محتوای تستی",
      chunkIdList: ["chunk-1"],
    });

    expect(prompt).toContain("GENERATE HIGH-DENSITY REVIEW SUMMARY");
    expect(prompt).toContain("10–15 minute review");
    expect(prompt).toContain("~12 minutes");
    expect(prompt).toContain("Molecular Mechanisms of Action");
    expect(prompt).toContain("Precise Numbers, Dosages");
    expect(prompt).toContain("Direct Comparisons & Distinctions");
    expect(prompt).toContain("High-Yield Exam Traps");
    expect(prompt).toContain("Return ONLY valid JSON matching this schema:");
  });

  it("generates review_summary draft with full structured payload and citations", async () => {
    const docId = randomUUID() as DocumentId;
    const doc = makeDocument({ id: docId }, organizationId);
    await documentStore.create(doc);
    const chunks = makeChunks(docId, organizationId, 4);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const result = await service.generateForDocument(
      actor,
      organizationId,
      docId,
      {
        types: ["review_summary"],
      },
    );

    expect(result.contents.length).toBe(1);
    const item = result.contents[0];
    expect(item.type).toBe("review_summary");
    expect(item.status).toBe("draft");
    expect(item.document_id).toBe(docId);

    const payload = item.payload as unknown as ReviewSummaryPayload;
    expect(payload.kind).toBe("review_summary");
    expect(payload.estimatedReadingMinutes).toBeGreaterThanOrEqual(10);
    expect(payload.estimatedReadingMinutes).toBeLessThanOrEqual(15);
    expect(payload.overview).toBeTruthy();
    expect(payload.sections.length).toBeGreaterThan(0);
    expect(payload.sections[0].keyPoints.length).toBeGreaterThan(0);
    expect(payload.sections[0].comparisons).toBeDefined();
    expect(payload.sections[0].memorizationPoints).toBeDefined();
    expect(payload.sections[0].examPoints).toBeDefined();
    expect(payload.finalTakeaways.length).toBeGreaterThan(0);
    expect(item.citations.length).toBeGreaterThan(0);
  });

  it("reflects review_summary status in getDocumentContentStatus", async () => {
    const docId = randomUUID() as DocumentId;
    const doc = makeDocument({ id: docId }, organizationId);
    await documentStore.create(doc);
    const chunks = makeChunks(docId, organizationId, 2);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    // Initial status: not generated
    const initialStatus = await service.getDocumentContentStatus(
      actor,
      organizationId,
      docId,
    );
    expect(initialStatus.review_summary.generated).toBe(false);
    expect(initialStatus.review_summary.count).toBe(0);

    // Generate review summary
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
    });

    // After generation: generated = true
    const updatedStatus = await service.getDocumentContentStatus(
      actor,
      organizationId,
      docId,
    );
    expect(updatedStatus.review_summary.generated).toBe(true);
    expect(updatedStatus.review_summary.count).toBe(1);
  });

  it("implements duplicate prevention & caching via generateReviewSummaryDirect", async () => {
    const docId = randomUUID() as DocumentId;
    const doc = makeDocument({ id: docId }, organizationId);
    await documentStore.create(doc);
    const chunks = makeChunks(docId, organizationId, 2);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    // 1st direct call -> generates
    const first = await service.generateReviewSummaryDirect(
      actor,
      organizationId,
      docId,
    );
    expect(first.type).toBe("review_summary");

    // 2nd direct call without force -> returns existing without duplicate
    const second = await service.generateReviewSummaryDirect(
      actor,
      organizationId,
      docId,
    );
    expect(second.id).toBe(first.id);

    // Check helper getReviewSummaryForDocument
    const fetched = await service.getReviewSummaryForDocument(
      actor,
      organizationId,
      docId,
    );
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(first.id);
  });
});
