import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type SourcePackRole,
  RoleBasedPolicy,
  sortSourcesByRolePriority,
  sortChunksByRolePriority,
  canonicalizeSourceRole,
} from "@avana/domain";
import {
  GenerationService,
  type SourceChunkItem,
} from "../modules/generation/generation-service.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import type { CompletionRequest } from "../modules/generation/gateway/model-gateway.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../modules/learning/learning-store.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

/**
 * Spying Model Gateway that records requests for deterministic assertions
 * while delegating response generation to MockModelGateway.
 */
class SpyingModelGateway extends MockModelGateway {
  public recordedRequests: CompletionRequest[] = [];

  override async complete(req: CompletionRequest) {
    this.recordedRequests.push(req);
    return super.complete(req);
  }

  getRequestsByStage(stage: string): CompletionRequest[] {
    return this.recordedRequests.filter((r) => r.stage === stage);
  }

  clearRecorded() {
    this.recordedRequests = [];
  }
}

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
  chunksData: Array<{ heading: string; content: string }>,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return chunksData.map((data, i) => ({
    id: randomUUID() as DocumentChunkRecord["id"],
    documentId: docId,
    organizationId: orgId,
    sequence: i + 1,
    heading: data.heading,
    content: data.content,
    startPage: i + 1,
    endPage: i + 1,
    tokenEstimate: Math.max(50, Math.ceil(data.content.length / 4)),
    contentHash: `hash-${i}-${docId.slice(0, 6)}`,
    createdAt: now,
  }));
}

describe("Source Role Governance & 5-Tier Decision Hierarchy (12 Scenarios)", () => {
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
  let gateway: SpyingModelGateway;
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
    gateway = new SpyingModelGateway();

    service = new GenerationService(
      contentStore,
      citationStore,
      gateway,
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

  // -------------------------------------------------------------------------
  // Scenario 1: Detailed Primary Notes vs Concise Reference
  // -------------------------------------------------------------------------
  it("Scenario 1: Detailed Primary Notes vs Concise Reference — preserves all detailed steps and prioritizes primary notes", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "LectureNotes-MuscleContraction.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "ConciseRef-PhysiologyOverview.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const detailedSteps = [
      {
        heading: "مرحله ۱: پتانسیل عمل و دپلاریزاسیون سارکولم",
        content: "پتانسیل عمل در نورون حرکتی به پایانه آکسونی رسیده و رهایش استیل‌کولین در شکاف سیناپسی باعث باز شدن کانال‌های لیگاندی سدیم و دپلاریزاسیون غشای سارکولم می‌گردد.",
      },
      {
        heading: "مرحله ۲: انتشار پتانسیل عمل به لوله‌های T و رهایش Ca2+",
        content: "تحریک لوله‌های عرضی (T-tubules) موجب تغییر کنفورماسیون گیرنده‌های دی‌هیدروپیریدین (DHPR) و باز شدن کانال‌های ریانودین (RyR1) در رتیکولوم سارکوپلاسمی و رهایش یون کلسیم به سارکوپلاسم می‌شود.",
      },
      {
        heading: "مرحله ۳: اتصال کلسیم به تروپونین C و حرکت تروپومیوزین",
        content: "یون‌های آزاد کلسیم به زیرواحد تروپونین C متصل شده و با تغییر ساختاری، تروپومیوزین را از روی جایگاه‌های فعال اکتین کنار می‌زنند.",
      },
      {
        heading: "مرحله ۴: چرخه پل‌های عرضی و لغزش فیلامان‌ها",
        content: "سرهای میوزین با هیدرولیز ATP به اکتین متصل شده، ضربه قدرتی (Power Stroke) ایجاد کرده و فیلامان‌های نازک را به سمت مرکز سارکومر می‌کشند.",
      },
    ];

    const conciseOverview = [
      {
        heading: "انقباض عضلانی به زبان ساده",
        content: "عضله با رسیدن پیام عصبی تحریک شده، یون کلسیم آزاد می‌شود و در نتیجه فیلامان‌ها روی هم لغزیده و انقباض رخ می‌دهد.",
      },
    ];

    const chunks1 = makeDocChunks(doc1Id, orgId, detailedSteps);
    const chunks2 = makeDocChunks(doc2Id, orgId, conciseOverview);
    await chunkStore.createMany(chunks1);
    await chunkStore.createMany(chunks2);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson", "review_summary"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "primary_reference" },
      ],
    });

    expect(result.document_status).toBe("review_pending");

    // Verify Planning prompt contains Canonical Source Role Governance instructions
    const planningRequests = gateway.getRequestsByStage("planning");
    expect(planningRequests.length).toBeGreaterThanOrEqual(1);
    const planningUserPrompt = planningRequests[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(planningUserPrompt).toContain("CANONICAL SOURCE ROLE GOVERNANCE & 5-TIER DECISION HIERARCHY");
    expect(planningUserPrompt).toContain("[Role: PRIMARY NOTES (جزوه اصلی)]");
    expect(planningUserPrompt).toContain("[Role: PRIMARY REFERENCE (رفرنس اصلی)]");

    // Verify Lesson content payload and coverage audit
    const lessonResource = result.contents.find((c) => c.type === "lesson");
    expect(lessonResource).toBeDefined();
    const lessonPayload = lessonResource!.payload as {
      coverageReport?: {
        primaryNotesCoverage?: {
          structural: boolean;
          content: boolean;
          status: string;
          resolvedChunks: string[];
          unresolvedChunks: string[];
        };
      };
    };

    expect(lessonPayload.coverageReport).toBeDefined();
    expect(lessonPayload.coverageReport?.primaryNotesCoverage?.status).toBe("complete");
    expect(lessonPayload.coverageReport?.primaryNotesCoverage?.unresolvedChunks).toEqual([]);
    expect(lessonPayload.coverageReport?.primaryNotesCoverage?.resolvedChunks.length).toBe(chunks1.length);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Missing Important Topic in Primary Notes, Present in Primary Reference
  // -------------------------------------------------------------------------
  it("Scenario 2: Missing Topic in Notes, Present in Reference — reference enriches as supplemental without displacing primary notes", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "LectureNotes-AtenololBasics.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "KatzungRef-BetaBlockersFull.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      {
        heading: "مکانیسم اثر آتنولول",
        content: "آتنولول یک بتابلوکر انتخابی بتا-۱ (کاردیوسلکتیو) است که بدون فعالیت سمپاتومیمتیک ذاتی (ISA) ضربان و برون‌ده قلب را کاهش می‌دهد.",
      },
      {
        heading: "فارماکوکینتیک آتنولول",
        content: "آتنولول یک داروی هیدروفیلی است، جذب گوارشی ناکامل دارد و عمدتاً بدون تغییر از طریق کلیه‌ها دفع می‌شود.",
      },
    ]);

    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      {
        heading: "موارد منع مصرف مطلق در آسم شدید و برونکواسپاسم",
        content: "اگرچه آتنولول بتا-۱ سلکتیو است، اما در دوزهای بالا انتخابی بودن خود را از دست می‌دهد و در بیماران آسم شدید و COPD پیشرفته منع مصرف دارد.",
      },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "primary_reference" },
      ],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    expect(lessonResource).toBeDefined();

    // Verify that primary notes chunks are completely covered (no displacement)
    const report = (lessonResource!.payload as any).coverageReport;
    expect(report.primaryNotesCoverage.status).toBe("complete");
    for (const chunk of doc1Chunks) {
      expect(report.primaryNotesCoverage.resolvedChunks).toContain(chunk.id);
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Question Template Limited to Few Topics
  // -------------------------------------------------------------------------
  it("Scenario 3: Question Template Limited to Few Topics — never drops other primary topics from syllabus or testing", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "LectureNotes-5Topics.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "ExamBank-2TopicsOnly.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const notes5Topics = makeDocChunks(doc1Id, orgId, [
      { heading: "مبحث ۱: فارماکودینامیک", content: "تعریف اگونیست، آنتاگونیست و تمایل پیوندی..." },
      { heading: "مبحث ۲: فارماکوکینتیک", content: "فرایندهای ADME در فارماکولوژی..." },
      { heading: "مبحث ۳: انتقال‌دهنده‌های کولینرژیک", content: "سنتز و ذخیره استیل‌کولین در پایانه عصبی..." },
      { heading: "مبحث ۴: گیرنده‌های آدرنرژیک", content: "انواع گیرنده‌های آلفا و بتا و مسیرهای G-protein..." },
      { heading: "مبحث ۵: تداخلات دارویی متابولیک", content: "نقش سیتوکروم P450 و القا یا مهار آنزیمی..." },
    ]);

    const questionBank = makeDocChunks(doc2Id, orgId, [
      { heading: "تست آزمون ۹۸", content: "کدام گزینه تعریف دقیق آنتاگونیست رقابتی است؟ الف) ... ب) ..." },
      { heading: "تست آزمون ۹۹", content: "نیمه‌عمر حذف دارو در مدل تک‌محفظه‌ای چگونه محاسبه می‌شود؟" },
    ]);

    await chunkStore.createMany(notes5Topics);
    await chunkStore.createMany(questionBank);

    // Filter used in Stage 3 Flashcards
    const allChunks: SourceChunkItem[] = [
      ...notes5Topics.map((c) => ({
        id: c.id,
        content: c.content,
        heading: c.heading,
        role: "primary_notes" as SourcePackRole,
        isPrimary: true,
      })),
      ...questionBank.map((c) => ({
        id: c.id,
        content: c.content,
        heading: c.heading,
        role: "question_template" as SourcePackRole,
        isPrimary: false,
      })),
    ];

    const flashcardChunks = allChunks.filter(
      (c) => canonicalizeSourceRole(c.role) !== "question_template",
    );
    expect(flashcardChunks.length).toBe(notes5Topics.length);
    expect(flashcardChunks.some((c) => c.role === "question_template")).toBe(false);

    // Generate with flashcard and quiz types
    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson", "flashcard", "quiz"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "question_template" },
      ],
    });
    expect(result).toBeDefined();

    const quizRequests = gateway.getRequestsByStage("quiz");
    expect(quizRequests.length).toBeGreaterThan(0);
    const quizPrompt = quizRequests[0].messages.find((m) => m.role === "user")?.content ?? "";

    // Verify anti-omission rule in quiz prompt
    expect(quizPrompt).toContain("NON-OMISSION GOVERNANCE");
    expect(quizPrompt).toContain("The question template does NOT dictate which topics may or may not be tested");
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Heavy Repetition of One Topic in Question Template
  // -------------------------------------------------------------------------
  it("Scenario 4: Heavy Repetition in Question Template — impacts test design/weight without deleting remaining topics", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "Notes-Endocrine.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "PastExams-DiabetesHeavy.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      { heading: "دیابت و انسولین", content: "پاتوفیزیولوژی دیابت تیپ ۱ و ۲ و انواع انسولین رگولار و NPH..." },
      { heading: "اختلالات تیروئید", content: "سنتز هورمون‌های T3 و T4، هیپوتیروئیدی و لووتیروکسین..." },
      { heading: "قشر آدرنال و کورتیکواستروئیدها", content: "محور HPA، کورتیزول و عوارض درمان طولانی با کورتون..." },
    ]);

    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      { heading: "کنکور ۹۵ دیابت", content: "سوال تست دیابت..." },
      { heading: "کنکور ۹۶ دیابت", content: "سوال تست دیابت..." },
      { heading: "کنکور ۹۷ دیابت", content: "سوال تست دیابت..." },
      { heading: "کنکور ۹۸ دیابت", content: "سوال تست دیابت..." },
      { heading: "کنکور ۹۹ دیابت", content: "سوال تست دیابت..." },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson", "quiz"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "question_template" },
      ],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    const report = (lessonResource!.payload as any).coverageReport;

    // Invariant: Non-repeated topics (Thyroid, Adrenal) are still 100% preserved
    expect(report.primaryNotesCoverage.status).toBe("complete");
    expect(report.primaryNotesCoverage.resolvedChunks.length).toBe(doc1Chunks.length);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Supplementary Reference with Relevant and Irrelevant Content
  // -------------------------------------------------------------------------
  it("Scenario 5: Supplementary Reference with Relevant & Irrelevant Content — filters out irrelevant sections", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "PrimaryNotes-Hypertension.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "SupplementaryHandbook.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      { heading: "خط اول درمان فشار خون", content: "مهارکننده‌های ACE، ARBها، مسدودکننده‌های کانال کلسیم دی‌هیدروپیریدینی و دیورتیک‌های تیازیدی." },
    ]);

    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      {
        heading: "تداخل لوزارتان با مکمل‌های پتاسیم (مرتبط)",
        content: "مصرف همزمان ARBها با مکمل‌های حاوی پتاسیم خطر هایپرکالمی شدید را بالا می‌برد.",
      },
      {
        heading: "تاریخچه کشف گیاه بید در قرن هفدهم میلادی (کاملاً نامرتبط)",
        content: "در سال ۱۷۶۳ میلادی ادوارد استون کشیش انگلیسی خواص پوست درخت بید را بررسی کرد که منجر به کشف سالیسیلیک اسید شد.",
      },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    // Verify sort order: supplementary reference chunks are sorted after primary notes
    const taggedDoc1 = doc1Chunks.map((c) => ({
      ...c,
      role: "primary_notes" as SourcePackRole,
      isPrimary: true,
    }));
    const taggedDoc2 = doc2Chunks.map((c) => ({
      ...c,
      role: "supplementary_reference" as SourcePackRole,
      isPrimary: false,
    }));

    const sorted = sortChunksByRolePriority([...taggedDoc2, ...taggedDoc1]);
    expect(sorted[0].role).toBe("primary_notes");
    expect(sorted[1].role).toBe("supplementary_reference");
    expect(sorted[2].role).toBe("supplementary_reference");

    // Test prompt instructions for filtering supplementary references
    await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "supplementary_reference" },
      ],
    });

    const requests = gateway.getRequestsByStage("planning");
    const planningPrompt = requests[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(planningPrompt).toContain("Any content, section, or chapter in the supplementary reference that is unrelated to the primary lesson scope MUST be ignored and discarded");
    expect(planningPrompt).toContain("Direct pedagogical relevance is the absolute condition for using supplementary references");
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Scientific Contradiction between Primary Notes and Primary Reference
  // -------------------------------------------------------------------------
  it("Scenario 6: Scientific Contradiction — primary notes is authoritative, reference contradiction handled via callout", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "ProfessorNotes-DrugDosage.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "GoodmanGilman-TextbookRef.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      {
        heading: "دوز شروع کارودیلول",
        content: "نظر استاد در جزوه: دوز شروع کارودیلول ۳.۱۲۵ میلی‌گرم ۲ بار در روز است و در صورت بروز افت فشار وضعیتی نباید قطع شود بلکه دوز شبانه تجویز شود.",
      },
    ]);

    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      {
        heading: "دوز رفرنس گودمن و گیلمن",
        content: "کتاب مرجع: دوز شروع استاندارد ۶.۲۵ میلی‌گرم روزانه است و در صورت برادی‌کاردی علامت‌دار دارو فوراً قطع شود.",
      },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "primary_reference" },
      ],
    });

    const lessonRequests = gateway.getRequestsByStage("lesson");
    expect(lessonRequests.length).toBeGreaterThan(0);
    const lessonPrompt = lessonRequests[0].messages.find((m) => m.role === "user")?.content ?? "";

    // Verify canonical contradiction governance instruction
    expect(lessonPrompt).toContain("SCIENTIFIC CONFLICT MANAGEMENT");
    expect(lessonPrompt).toContain("When lecture notes (primary_notes) and the authoritative textbook (primary_reference) disagree, do NOT silently drop, ignore, or replace either source");
    expect(lessonPrompt).toContain("Explicitly highlight and address the scientific distinction using semantic callouts");
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Multiple Files per Role
  // -------------------------------------------------------------------------
  it("Scenario 7: Multiple Files per Role — preserves role hierarchy and source order", async () => {
    const docA1 = makeDoc(randomUUID() as DocumentId, orgId, courseId, "LecturePart1.pdf");
    const docA2 = makeDoc(randomUUID() as DocumentId, orgId, courseId, "LecturePart2.pdf");
    const docB1 = makeDoc(randomUUID() as DocumentId, orgId, courseId, "ReferencePart1.pdf");
    const docB2 = makeDoc(randomUUID() as DocumentId, orgId, courseId, "ReferencePart2.pdf");

    await docStore.create(docA1);
    await docStore.create(docA2);
    await docStore.create(docB1);
    await docStore.create(docB2);

    const sources = [
      { documentId: docB2.id, order: 3, role: "primary_reference" as SourcePackRole },
      { documentId: docA2.id, order: 1, role: "primary_notes" as SourcePackRole },
      { documentId: docB1.id, order: 2, role: "primary_reference" as SourcePackRole },
      { documentId: docA1.id, order: 0, role: "primary_notes" as SourcePackRole },
    ];

    const sortedSources = sortSourcesByRolePriority(sources);

    // Primary notes first in order 0, 1; then primary reference in order 2, 3
    expect(sortedSources[0].documentId).toBe(docA1.id);
    expect(sortedSources[1].documentId).toBe(docA2.id);
    expect(sortedSources[2].documentId).toBe(docB1.id);
    expect(sortedSources[3].documentId).toBe(docB2.id);

    // Chunks from multiple files with same role retain role invariant
    const chunksA1 = makeDocChunks(docA1.id, orgId, [{ heading: "A1", content: "Notes 1" }]);
    const chunksA2 = makeDocChunks(docA2.id, orgId, [{ heading: "A2", content: "Notes 2" }]);
    await chunkStore.createMany(chunksA1);
    await chunkStore.createMany(chunksA2);

    const result = await service.generateForDocument(actor, orgId, docA1.id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: docA1.id, order: 0, role: "primary_notes" },
        { documentId: docA2.id, order: 1, role: "primary_notes" },
      ],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    const report = (lessonResource!.payload as any).coverageReport;

    // Both files are primary_notes, both are required to be covered
    expect(report.primaryNotesCoverage.status).toBe("complete");
    expect(report.primaryNotesCoverage.resolvedChunks).toContain(chunksA1[0].id);
    expect(report.primaryNotesCoverage.resolvedChunks).toContain(chunksA2[0].id);
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Exam Review Summary Dense Generation (Stage 5)
  // -------------------------------------------------------------------------
  it("Scenario 8: Exam Review Summary — compact format without omitting key distinctions or mechanisms", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "LectureNotes-PharmacologyKeyMechanisms.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "Ref-PharmacologyBrief.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      {
        heading: "مکانیسم مهار پمپ پروتون (PPI)",
        content: "امپرازول یک پیش‌دارو است که در محیط اسیدی کانالیکول‌های سلول پاریتال فعال شده و با پیوند دی‌سولفیدی برگشت‌ناپذیر پمپ H+/K+ ATPase را مهار می‌کند.",
      },
    ]);
    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      {
        heading: "داروهای گوارشی",
        content: "امپرازول اسید معده را کم می‌کند.",
      },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson", "review_summary"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "primary_reference" },
      ],
    });

    const summaryRequests = gateway.getRequestsByStage("review_summary");
    expect(summaryRequests.length).toBeGreaterThanOrEqual(1);
    const summaryPrompt = summaryRequests[0].messages.find((m) => m.role === "user")?.content ?? "";

    // Verify Stage 5 retention invariant instruction
    expect(summaryPrompt).toContain("قانون بقا و جامعیت جزوه اصلی: خلاصه مروری باید فشرده باشد اما تمایزات کلیدی");
    expect(summaryPrompt).toContain("[ROLE: primary_notes]");
    expect(summaryPrompt).toContain("[ROLE: primary_reference]");

    const summaryResource = result.contents.find((c) => c.type === "review_summary");
    expect(summaryResource).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Role Handling in Flashcards vs Quizzes
  // -------------------------------------------------------------------------
  it("Scenario 9: Outputs Specialization — question templates excluded from flashcards, quizzes grounded in lesson", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;
    const doc3Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "PrimaryNotes.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "Supplementary.pdf");
    const doc3 = makeDoc(doc3Id, orgId, courseId, "QuestionTemplateBank.pdf");

    await docStore.create(doc1);
    await docStore.create(doc2);
    await docStore.create(doc3);

    const chunks1 = makeDocChunks(doc1Id, orgId, [{ heading: "Concept A", content: "Teaching content A" }]);
    const chunks2 = makeDocChunks(doc2Id, orgId, [{ heading: "Supplementary B", content: "Supplemental content B" }]);
    const chunks3 = makeDocChunks(doc3Id, orgId, [{ heading: "Question Pattern C", content: "Multiple choice question structure C" }]);

    await chunkStore.createMany(chunks1);
    await chunkStore.createMany(chunks2);
    await chunkStore.createMany(chunks3);

    await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson", "flashcard", "quiz"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "supplementary_reference" },
        { documentId: doc3Id, order: 2, role: "question_template" },
      ],
    });

    // 1. Verify Flashcard prompt does NOT include question_template chunks
    const flashcardRequests = gateway.getRequestsByStage("flashcard");
    expect(flashcardRequests.length).toBeGreaterThan(0);
    const flashcardPrompt = flashcardRequests[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(flashcardPrompt).not.toContain(chunks3[0].id);

    // 2. Verify Quiz prompt contains guidance for question patterns
    const quizRequests = gateway.getRequestsByStage("quiz");
    expect(quizRequests.length).toBeGreaterThan(0);
    const quizPrompt = quizRequests[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(quizPrompt).toContain("QUESTION TEMPLATE SAMPLES");
    expect(quizPrompt).toContain("NON-OMISSION GOVERNANCE");
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Multi-Stage / Chunked Generation Continuity
  // -------------------------------------------------------------------------
  it("Scenario 10: Multi-Stage Chunk Continuity — ensurePrimaryNotesChunkCoverage guarantees zero dropped primary chunks", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc1 = makeDoc(doc1Id, orgId, courseId, "MultiChunkNotes.pdf");
    await docStore.create(doc1);

    const fourChunks = makeDocChunks(doc1Id, orgId, [
      { heading: "بخش ۱", content: "مبحث مقدماتی اول" },
      { heading: "بخش ۲", content: "مبحث عمیق دوم" },
      { heading: "بخش ۳", content: "مبحث بالینی سوم" },
      { heading: "بخش ۴", content: "مبحث جمع‌بندی چهارم" },
    ]);
    await chunkStore.createMany(fourChunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [{ documentId: doc1Id, order: 0, role: "primary_notes" }],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    const report = (lessonResource!.payload as any).coverageReport;

    expect(report.primaryNotesCoverage.status).toBe("complete");
    expect(report.primaryNotesCoverage.structural.structuralCoveragePct).toBe(100);
    expect(report.primaryNotesCoverage.structural.assignedPrimaryChunks).toBe(4);
    expect(report.primaryNotesCoverage.unresolvedChunks).toEqual([]);
    for (const chunk of fourChunks) {
      expect(report.primaryNotesCoverage.resolvedChunks).toContain(chunk.id);
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Unique Professor-Specific Topic Only in Primary Notes
  // -------------------------------------------------------------------------
  it("Scenario 11: Unique Professor Topic — guaranteed to be taught and preserved, never pruned", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "ProfSpecialLecture.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "StandardGeneralRef.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const uniqueProfChunk = {
      heading: "دیدگاه اختصاصی استاد در بیمارستان امام",
      content: "پروتکل ۳ مرحله‌ای اختصاصی درمان آریتمی بطنی مقاوم به لیدوکائین که انحصارا توسط بخش ما اجرا می‌شود.",
    };

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [uniqueProfChunk]);
    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      { heading: "سرفصل کلی کتاب", content: "درمان‌های عمومی بیماری‌های قلبی در کتب مرجع آمریکایی..." },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "primary_reference" },
      ],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    const payload = lessonResource!.payload as any;
    expect(payload.coverageReport.primaryNotesCoverage.status).toBe("complete");
    expect(payload.coverageReport.primaryNotesCoverage.resolvedChunks).toContain(doc1Chunks[0].id);
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Supplementary Reference with Extensive Out-of-Scope Topics
  // -------------------------------------------------------------------------
  it("Scenario 12: Extensive Out-of-Scope Topics in Supplementary Reference — strictly filtered out from syllabus", async () => {
    const doc1Id = randomUUID() as DocumentId;
    const doc2Id = randomUUID() as DocumentId;

    const doc1 = makeDoc(doc1Id, orgId, courseId, "HypertensionNotes.pdf");
    const doc2 = makeDoc(doc2Id, orgId, courseId, "Massive500PageInternalMedicineCompendium.pdf");
    await docStore.create(doc1);
    await docStore.create(doc2);

    const doc1Chunks = makeDocChunks(doc1Id, orgId, [
      { heading: "درمان دارویی فشار خون", content: "پروتکل مهار سیستم رنین آنژیوتانسین در بیماران مبتلا به هایپرتنشن." },
    ]);

    const doc2Chunks = makeDocChunks(doc2Id, orgId, [
      { heading: "فصل ۲۲: عفونت‌های ریوی و پنومونی", content: "عوامل پاتوژن باکتریایی پنومونی اکتسابی از جامعه..." },
      { heading: "فصل ۳۵: آرتریت روماتوئید و بیماری‌های بافت همبند", content: "پاتولوژی مفاصل سینوویال و تست‌های سرولوژیک RF..." },
      { heading: "فصل ۵۰: اختلالات تشنجی و اپی‌لپسی", content: "طبقه‌بندی صرع کانونی و ژنرالیزه و داروهای ضدتشنج..." },
    ]);

    await chunkStore.createMany(doc1Chunks);
    await chunkStore.createMany(doc2Chunks);

    const result = await service.generateForDocument(actor, orgId, doc1Id, {
      types: ["lesson"],
      courseId,
      sources: [
        { documentId: doc1Id, order: 0, role: "primary_notes" },
        { documentId: doc2Id, order: 1, role: "supplementary_reference" },
      ],
    });

    const lessonResource = result.contents.find((c) => c.type === "lesson");
    const payload = lessonResource!.payload as any;

    // Verify syllabus title and coverage are anchored to primary notes
    expect(payload.coverageReport.primaryNotesCoverage.status).toBe("complete");

    // Planning prompt contains explicit prohibition against drifting into out-of-scope reference chapters
    const planningRequests = gateway.getRequestsByStage("planning");
    const planningPrompt = planningRequests[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(planningPrompt).toContain("Any content, section, or chapter in the supplementary reference that is unrelated to the primary lesson scope MUST be ignored and discarded");
    expect(planningPrompt).toContain("The primary notes determine the mandatory scope, curriculum, topics, and structure of all generated content");
  });
});
