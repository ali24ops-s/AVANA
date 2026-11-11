import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GeneratedContentId,
  type DocumentChunkId,
  type ReviewSummaryPayload,
  RoleBasedPolicy,
  DomainError,
  validateAndGroundReviewSummaryCitations,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import { InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import type { DocumentRecord, DocumentChunkRecord } from "../modules/learning/learning-store.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "cardiovascular-notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 1,
    status: "extracted",
    errorCode: null,
    retryCount: 0,
    qualityScore: null,
    qualityLevel: null,
    qualityReport: null,
    qualityAnalyzedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  count = 3,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID() as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `فصل ${i + 1}`,
    content: `محتوای متنی مهم چانک شماره ${i + 1} درباره داروهای قلبی عروقی`,
    startPage: 1,
    endPage: 1,
    tokenEstimate: 50,
    contentHash: `hash-${i + 1}`,
    createdAt: now,
  }));
}

function createMockLesson(
  documentId: DocumentId,
  courseId: CourseId,
  organizationId: OrganizationId,
  chunkIds: string[],
  overrides?: {
    sessions?: Array<{
      title: string;
      contentMarkdown: string;
      citationChunkIds?: string[];
    }>;
  },
) {
  const now = new Date().toISOString();
  const sessions = overrides?.sessions ?? [
    {
      title: "جلسه ۱: مسدودکننده‌های گیرنده بتا",
      contentMarkdown: "# جلسه ۱\n\nداروهای مسدودکننده بتا شامل پروپرانولول و متوپرولول هستند.",
      citationChunkIds: chunkIds,
    },
    {
      title: "جلسه ۲: مهارکننده‌های ACE",
      contentMarkdown: "# جلسه ۲\n\nکاپتوپریل و انالاپریل از مهارکننده‌های آنزیم مبدل آنژیوتانسین هستند.",
      citationChunkIds: chunkIds,
    },
  ];

  return {
    id: randomUUID() as GeneratedContentId,
    organizationId,
    documentId,
    courseId,
    type: "lesson" as const,
    status: "draft" as const,
    payload: {
      kind: "lesson" as const,
      moduleTitle: "فارماکولوژی قلب و عروق",
      title: "فارماکولوژی قلب و عروق",
      outline: [
        { title: "بتابلوکرها", description: "شرح داروهای بتا" },
        { title: "ACEI", description: "شرح مهارکننده‌های ACE" },
      ],
      sessions,
      contentMarkdown: sessions.map((s) => s.contentMarkdown).join("\n\n"),
      citationChunkIds: chunkIds,
      coverageReport: {
        sourceTopicsIdentified: [
          { title: "بتابلوکرها", description: "شرح داروهای بتا", relevantChunkIds: chunkIds },
          { title: "ACEI", description: "شرح مهارکننده‌های ACE", relevantChunkIds: chunkIds },
        ],
        sessionsAudit: [
          { keyConcepts: [{ id: "concept-1", name: "پروپرانولول", description: "بتابلوکر غیرانتخابی" }] },
          { keyConcepts: [{ id: "concept-2", name: "انالاپریل", description: "مهارکننده ACE" }] },
        ],
      },
    },
    promptVersion: "v1",
    model: "gemini-mock",
    tokenUsage: { inputTokens: 100, outputTokens: 200 },
    generationKey: null,
    acceptedAt: null,
    acceptedBy: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
    editedBy: null,
    editedAt: null,
    previousPayload: null,
    materializedLessonId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

describe("Stage 5 Review Summary Modernization Suite", () => {
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

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
    chunkRecordStore = new InMemoryGenerationChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  function createService(mockGateway?: any) {
    return new GenerationService(
      contentStore,
      citationStore,
      mockGateway ?? new MockModelGateway(),
      documentStore,
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
    );
  }

  // 1. Full Grounded Mode
  it("Scenario 1: Full Grounded Mode generates summary with validated chunk citations", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    const mockGateway = {
      provider: "mock" as const,
      model: "mock-gemini",
      complete: async () => ({
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه مروری فارماکولوژی قلب",
          estimatedReadingMinutes: 8,
          overview: "این فصل به بررسی داروهای قلبی عروقی می‌پردازد.",
          sections: [
            {
              id: "sec-1",
              title: "داروهای بتابلوکر",
              keyPoints: ["کاهش ضربان قلب", "کاهش مصرف اکسیژن میوکارد"],
              relatedSessionIds: ["session-1"],
              citationChunkIds: [chunks[0].id],
            },
            {
              id: "sec-2",
              title: "داروهای ACEI",
              keyPoints: ["کاهش بار پس‌بار", "کاهش ترشح آلدوسترون"],
              relatedSessionIds: ["session-2"],
              citationChunkIds: [chunks[1].id],
            },
          ],
          finalTakeaways: ["انتخاب بتابلوکرها در نارسایی قلبی مزمن بر اساس شواهد انجام می‌شود."],
          citationChunkIds: chunks.map((c) => c.id),
        }),
        model: "mock-gemini",
        usage: { inputTokens: 300, outputTokens: 250 },
        finishReason: "stop",
      }),
    };

    const service = createService(mockGateway);
    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
    });

    expect(result.contents.length).toBe(1);
    const summary = result.contents[0];
    expect(summary.type).toBe("review_summary");
    expect(summary.payload.kind).toBe("review_summary");
    expect((summary.payload as ReviewSummaryPayload).citationChunkIds).toEqual(chunks.map((c) => c.id));

    // Verify citations persisted in citation store
    const persistedCitations = await citationStore.listByGeneratedContent(summary.id);
    expect(persistedCitations.length).toBe(2);
    expect(persistedCitations.map((c) => c.documentChunkId)).toEqual(chunks.map((c) => c.id));
  });

  // 2. Lesson-Based Mode (Chunks absent / 0 chunks)
  it("Scenario 2: Lesson-Based Mode generates clean summary without fake chunk IDs and 0 citation rows", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    // 0 chunks in chunkStore!
    const lesson = createMockLesson(docId, courseId, organizationId, []);
    await contentStore.create(lesson);

    const mockGateway = {
      provider: "mock" as const,
      model: "mock-gemini",
      complete: async (req: any) => {
        // Assert user prompt reflects Lesson-Based Mode
        const userPrompt = req.messages.find((m: any) => m.role === "user")?.content ?? "";
        expect(userPrompt).toContain("Lesson-Based Synthesis Mode");

        return {
          text: JSON.stringify({
            kind: "review_summary",
            title: "خلاصه مروری بدون چانک",
            estimatedReadingMinutes: 5,
            overview: "خلاصه کامل مستخرج از درسنامه‌های معتبر.",
            sections: [
              {
                id: "sec-1",
                title: "بخش اول مروری",
                keyPoints: ["نکته کلیدی ۱"],
                relatedSessionIds: ["session-1"],
                citationChunkIds: [], // Empty in Lesson-Based Mode
              },
            ],
            finalTakeaways: ["جمع‌بندی نهایی."],
            citationChunkIds: [],
          }),
          model: "mock-gemini",
          usage: { inputTokens: 200, outputTokens: 150 },
          finishReason: "stop",
        };
      },
    };

    const service = createService(mockGateway);
    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
    });

    const summary = result.contents[0];
    const payload = summary.payload as ReviewSummaryPayload;
    expect(payload.citationChunkIds).toEqual([]);
    expect(payload.sections[0].citationChunkIds).toEqual([]);
    expect(payload.sections[0].relatedSessionIds).toEqual(["session-1"]);

    // Assert 0 rows in citation store (no DB foreign key constraint violations!)
    const persistedCitations = await citationStore.listByGeneratedContent(summary.id);
    expect(persistedCitations.length).toBe(0);
  });

  // 3. Missing Document Record in documentStore (Legacy / Migrated Course)
  it("Scenario 3: Missing document record in documentStore resolves gracefully via Course/Lesson", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;

    // Notice: we do NOT create the document in documentStore!
    const lesson = createMockLesson(docId, courseId, organizationId, []);
    await contentStore.create(lesson);

    const mockGateway = {
      provider: "mock" as const,
      model: "mock-gemini",
      complete: async () => ({
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه دوره قدیمی",
          estimatedReadingMinutes: 6,
          overview: "خلاصه مباحث دوره بدون فایل اصلی",
          sections: [
            {
              id: "sec-1",
              title: "مرور نکات",
              keyPoints: ["نکته ۱"],
              relatedSessionIds: ["session-1"],
              citationChunkIds: [],
            },
          ],
          finalTakeaways: ["پایان"],
          citationChunkIds: [],
        }),
        model: "mock-gemini",
        usage: { inputTokens: 150, outputTokens: 100 },
        finishReason: "stop",
      }),
    };

    const service = createService(mockGateway);
    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
    });

    expect(result.contents.length).toBe(1);
    expect(result.contents[0].type).toBe("review_summary");
    expect(result.document_status).toBe("ready");
  });

  // 4. Stale / Chunk Mismatch (NEVER delete or invalidate Stage 2 lessons)
  it("Scenario 4: Chunk mismatch smoothly degrades to Lesson-Based Mode and NEVER deletes or invalidates Stage 2 lesson", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    // Current chunks in DB have different IDs than what's stored in the lesson
    const currentChunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(currentChunks);

    const oldChunkIds = [randomUUID(), randomUUID()];
    const lesson = createMockLesson(docId, courseId, organizationId, oldChunkIds);
    await contentStore.create(lesson);

    const mockGateway = {
      provider: "mock" as const,
      model: "mock-gemini",
      complete: async () => ({
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه درسنامه ناهمخوان",
          estimatedReadingMinutes: 7,
          overview: "تولید بر مبنای درسنامه با چانک‌های قدیمی",
          sections: [
            {
              id: "sec-1",
              title: "مبحث تطبیقی",
              keyPoints: ["نکته تطبیق"],
              relatedSessionIds: ["session-1"],
              citationChunkIds: [],
            },
          ],
          finalTakeaways: ["جمع‌بندی"],
          citationChunkIds: [],
        }),
        model: "mock-gemini",
        usage: { inputTokens: 200, outputTokens: 150 },
        finishReason: "stop",
      }),
    };

    const service = createService(mockGateway);
    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
      force: true,
    });

    expect(result.contents[0].type).toBe("review_summary");

    // CRITICAL: Verify lesson was NOT deleted, NOT overwritten, and still exists!
    const allContents = await contentStore.listByDocument(docId, organizationId);
    const lessonInDb = allContents.find((c) => c.type === "lesson" && c.deletedAt === null);
    expect(lessonInDb).toBeDefined();
    expect(lessonInDb!.id).toBe(lesson.id);
  });

  // 5. Empty / Invalid Lesson Sessions
  it("Scenario 5: Lesson with empty sessions throws STAGE5_INSUFFICIENT_LESSONS without touching Stage 1/2", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const lesson = createMockLesson(docId, courseId, organizationId, [], {
      sessions: [
        { title: "جلسه خالی", contentMarkdown: "   ", citationChunkIds: [] },
      ],
    });
    await contentStore.create(lesson);

    const service = createService();

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
      }),
    ).rejects.toThrowError(/STAGE5_INSUFFICIENT_LESSONS/);

    // Verify lesson was not deleted
    const allContents = await contentStore.listByDocument(docId, organizationId);
    expect(allContents.some((c) => c.id === lesson.id && c.deletedAt === null)).toBe(true);
  });

  // 6. Completely Missing Lesson
  it("Scenario 6: Completely missing lesson throws STAGE5_INSUFFICIENT_LESSONS", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const service = createService();

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
      }),
    ).rejects.toThrowError(/STAGE5_INSUFFICIENT_LESSONS/);
  });

  // 7. Gemini Failure & Atomic Recovery (Regenerating -> Draft)
  it("Scenario 7: Gemini failure restores regenerating summary back to draft and preserves previous output", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    // Seed previous review summary in "regenerating" status
    const previousSummaryId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: previousSummaryId,
      organizationId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "regenerating",
      payload: {
        kind: "review_summary",
        title: "خلاصه قبلی",
        estimatedReadingMinutes: 5,
        overview: "نمای کلی قبلی",
        sections: [],
        finalTakeaways: [],
        citationChunkIds: [],
        targetReadingMinutes: 5,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 10 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const failingGateway = {
      provider: "mock" as const,
      model: "mock-failing",
      complete: async () => {
        throw new DomainError("rate_limit_exceeded", "Gemini API rate limit exceeded");
      },
    };

    const service = createService(failingGateway);

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
        force: true,
      }),
    ).rejects.toMatchObject({ code: "rate_limit_exceeded" });

    // Verify previous summary was restored back to "draft"
    const recovered = await contentStore.findByIdForOrganization(previousSummaryId, organizationId);
    expect(recovered).toBeDefined();
    expect(recovered!.status).toBe("draft");
    expect(recovered!.deletedAt).toBeNull();
  });

  // 8. Gemini Malformed JSON Parse Failure
  it("Scenario 8: Malformed JSON preserves previous draft and throws error", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    const previousSummaryId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: previousSummaryId,
      organizationId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "خلاصه قبلی معتبر",
        estimatedReadingMinutes: 5,
        overview: "نمای کلی",
        sections: [],
        finalTakeaways: [],
        citationChunkIds: [],
        targetReadingMinutes: 5,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 10 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const malformedGateway = {
      provider: "mock" as const,
      model: "mock",
      complete: async () => ({
        text: "NOT_JSON_AT_ALL {{{",
        model: "mock",
        usage: { inputTokens: 50, outputTokens: 50 },
        finishReason: "stop",
      }),
    };

    const service = createService(malformedGateway);

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
        force: true,
      }),
    ).rejects.toThrow();

    // Previous draft is completely preserved
    const prev = await contentStore.findByIdForOrganization(previousSummaryId, organizationId);
    expect(prev).toBeDefined();
    expect(prev!.deletedAt).toBeNull();
  });

  // 9. Strict Grounding Enforcement in Full Mode
  it("Scenario 9: Strict Grounding rejects unknown chunk citations in Full Mode", () => {
    const payload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "تست استناد نامعتبر",
      estimatedReadingMinutes: 5,
      overview: "بررسی",
      sections: [
        {
          id: "sec-1",
          title: "بخش ۱",
          keyPoints: ["نکته"],
          citationChunkIds: ["non-existent-chunk-id"],
        },
      ],
      finalTakeaways: [],
      citationChunkIds: ["valid-chunk-1"],
      targetReadingMinutes: 5,
    };

    expect(() => {
      validateAndGroundReviewSummaryCitations(payload, ["valid-chunk-1", "valid-chunk-2"]);
    }).toThrowError(/STAGE5_INVALID_SECTION_CITATION/);
  });

  // 10. Non-Destructive Invariant for Stage 2
  it("Scenario 10: Stage 2 lessons are never deleted or modified during any review_summary operation", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    const service = createService();
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
    });

    const lessonAfter = await contentStore.findByIdForOrganization(lesson.id, organizationId);
    expect(lessonAfter).toBeDefined();
    expect(lessonAfter!.deletedAt).toBeNull();
    expect(lessonAfter!.updatedAt).toBe(lesson.updatedAt);
  });

  // 11. Accepted Content Protection
  it("Scenario 11: Accepted Review Summary is NEVER deleted, overwritten, or degraded", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    // Create an ACCEPTED summary
    const acceptedId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: acceptedId,
      organizationId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "خلاصه تأییدشده رسمی",
        estimatedReadingMinutes: 10,
        overview: "متن تأییدشده",
        sections: [],
        finalTakeaways: [],
        citationChunkIds: chunks.map((c) => c.id),
        targetReadingMinutes: 10,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 50, outputTokens: 50 },
      generationKey: null,
      acceptedAt: new Date().toISOString(),
      acceptedBy: actor.userId,
      reviewedBy: actor.userId,
      reviewedAt: new Date().toISOString(),
      reviewReason: "Approved",
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const service = createService();
    // Force generate a new summary
    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
      force: true,
    });

    // The new summary draft is returned
    expect(result.contents[0].id).not.toBe(acceptedId);

    // CRITICAL: The accepted summary must STILL be accepted and NOT deleted!
    const acceptedSummary = await contentStore.findByIdForOrganization(acceptedId, organizationId);
    expect(acceptedSummary).toBeDefined();
    expect(acceptedSummary!.status).toBe("accepted");
    expect(acceptedSummary!.deletedAt).toBeNull();
  });

  // 12. Isolation of Stages 3 and 4
  it("Scenario 12: Stage 3 Flashcards and Stage 4 Quizzes remain completely untouched", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    // Create a flashcard and quiz
    const cardId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: cardId,
      organizationId,
      documentId: docId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: { kind: "flashcard", front: "سوال ۱", back: "پاسخ ۱", citationChunkIds: [chunks[0].id] } as any,
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 10 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const quizId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: quizId,
      organizationId,
      documentId: docId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: { kind: "quiz", question: "تست ۱", options: [], correctAnswer: 0, citationChunkIds: [chunks[0].id] } as any,
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 10 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const service = createService();
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["review_summary"],
      courseId,
      force: true,
    });

    // Check flashcard and quiz are untouched
    const card = await contentStore.findByIdForOrganization(cardId, organizationId);
    expect(card).toBeDefined();
    expect(card!.deletedAt).toBeNull();

    const quiz = await contentStore.findByIdForOrganization(quizId, organizationId);
    expect(quiz).toBeDefined();
    expect(quiz!.deletedAt).toBeNull();
  });

  // 13. Tenant & Course Isolation
  it("Scenario 13: Tenant & course isolation prevents cross-organization access", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const otherOrgId = randomUUID() as OrganizationId;

    // Lesson belongs to another org
    const foreignLesson = createMockLesson(docId, courseId, otherOrgId, []);
    await contentStore.create(foreignLesson);

    const service = createService();

    // Trying to access via our organizationId must fail
    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
      }),
    ).rejects.toThrow();
  });

  // 14. Atomic Persistence Cleanup on Citation Failure
  it("Scenario 14: Failure during citation persistence rolls back new draft and keeps previous draft", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const doc = makeDocument({ id: docId, courseId }, organizationId);
    await documentStore.create(doc);

    const chunks = makeChunks(docId, organizationId, 2);
    await chunkStore.createMany(chunks);

    const lesson = createMockLesson(docId, courseId, organizationId, chunks.map((c) => c.id));
    await contentStore.create(lesson);

    // Seed existing draft
    const oldDraftId = randomUUID() as GeneratedContentId;
    await contentStore.create({
      id: oldDraftId,
      organizationId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "draft",
      payload: {
        kind: "review_summary",
        title: "پیش‌نویس قبلی",
        estimatedReadingMinutes: 5,
        overview: "نمای کلی",
        sections: [],
        finalTakeaways: [],
        citationChunkIds: [],
        targetReadingMinutes: 5,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 10 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Make citation store fail on createMany
    citationStore.createMany = async () => {
      throw new Error("Simulated DB Foreign Key violation on citation persistence");
    };

    const mockGateway = {
      provider: "mock" as const,
      model: "mock-gemini",
      complete: async () => ({
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه جدید",
          estimatedReadingMinutes: 5,
          overview: "نمای کلی جدید",
          sections: [
            {
              id: "sec-1",
              title: "بخش ۱",
              keyPoints: ["نکته"],
              relatedSessionIds: ["session-1"],
              citationChunkIds: [chunks[0].id],
            },
          ],
          finalTakeaways: [],
          citationChunkIds: [chunks[0].id],
        }),
        model: "mock-gemini",
        usage: { inputTokens: 50, outputTokens: 50 },
        finishReason: "stop",
      }),
    };

    const service = createService(mockGateway);

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["review_summary"],
        courseId,
        force: true,
      }),
    ).rejects.toThrowError(/Simulated DB Foreign Key violation/);

    // Assert that the old draft was NOT deleted
    const oldDraft = await contentStore.findByIdForOrganization(oldDraftId, organizationId);
    expect(oldDraft).toBeDefined();
    expect(oldDraft!.deletedAt).toBeNull();

    // Assert that all other drafts (the new one that failed) are soft-deleted
    const allSummaries = (await contentStore.listByDocument(docId, organizationId)).filter(
      (c) => c.type === "review_summary",
    );
    const activeSummaries = allSummaries.filter((c) => c.deletedAt === null);
    expect(activeSummaries.length).toBe(1);
    expect(activeSummaries[0].id).toBe(oldDraftId);
  });
});
