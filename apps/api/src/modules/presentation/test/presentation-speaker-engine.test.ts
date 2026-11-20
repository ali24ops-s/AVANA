/**
 * Presentation Speaker Engine Integration & Unit Tests (Phase 1).
 *
 * Verifies:
 * 1. validateSpeakerContentSchema & extractAllSpeakerChunkIds.
 * 2. buildSpeakerPrompt & buildSpeakerRepairPrompt with Persian oral instructions.
 * 3. ServerCitationValidator.validateSpeakerContent (supported claims, insufficient evidence, allowlist).
 * 4. PresentationGenerationService with PresentationSpeakerContent:
 *    - Real Corticosteroid mechanism of action slide.
 *    - Original slide rawText preservation (NOT overwritten).
 *    - speaker_notes updated with speechText.
 *    - extractionMetadata.speechContent structured persistence & archiving.
 *    - Controlled single-attempt repair.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { UUID } from "node:crypto";
import {
  type Actor,
  type PresentationProjectId,
  type PresentationReferenceId,
  type PresentationSlideId,
  type PresentationSpeakerContent,
  type SlideReferenceContextSnapshot,
  asOrganizationId,
  asPresentationProjectId,
  asPresentationReferenceId,
  asUserId,
  DomainError,
  PRESENTATION_CANONICAL_MODEL,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import { InMemoryPresentationProjectStore } from "../in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { PresentationGenerationService } from "../presentation-generation-service.js";
import { ServerCitationValidator } from "../server-citation-validator.js";
import { PresentationPromptBuilder } from "../presentation-prompt-builder.js";
import {
  validateSpeakerContentSchema,
  extractAllSpeakerChunkIds,
} from "../presentation-generation-schema.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { ModelGateway, CompletionRequest, CompletionResponse } from "../../generation/gateway/types.js";

class MockGateway implements ModelGateway {
  model = PRESENTATION_CANONICAL_MODEL;
  completionHistory: CompletionRequest[] = [];
  completeHandler?: (req: CompletionRequest) => Promise<CompletionResponse>;

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.completionHistory.push(req);
    if (this.completeHandler) {
      return this.completeHandler(req);
    }
    return {
      text: "{}",
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 100, outputTokens: 100 },
      finishReason: "stop",
    };
  }

  async countTokens(): Promise<number> {
    return 10;
  }
}

describe("Presentation Speaker Engine (Phase 1)", () => {
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let orgStore: OrganizationStore;
  let gateway: MockGateway;
  let service: PresentationGenerationService;

  const testOrgId = asOrganizationId(randomUUID() as UUID);
  const testUserId = asUserId(randomUUID() as UUID);
  const testActor: Actor = {
    userId: testUserId,
    role: "organization_admin",
    globalRole: null,
  };

  let testProjectId: PresentationProjectId;
  let testSlideId: PresentationSlideId;
  let testRefId: PresentationReferenceId;

  const chunk1Id = "chunk-corticosteroid-001";
  const chunk1Content = "Glucocorticoids diffuse across cell membrane and bind cytoplasmic glucocorticoid receptors (GR), inducing dissociation of heat shock proteins (HSP90).";
  const chunk1Hash = createHash("sha256").update(chunk1Content, "utf8").digest("hex");

  const chunk2Id = "chunk-corticosteroid-002";
  const chunk2Content = "The ligand-GR complex translocates into the nucleus and binds glucocorticoid response elements (GRE) or interacts directly with NF-kB and AP-1 to repress pro-inflammatory cytokines.";
  const chunk2Hash = createHash("sha256").update(chunk2Content, "utf8").digest("hex");

  beforeEach(async () => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    gateway = new MockGateway();

    orgStore = {
      listMembershipsByUserId: vi.fn().mockResolvedValue([
        { organizationId: testOrgId, role: "organization_admin" },
      ]),
      findMembership: vi.fn(),
      findById: vi.fn(),
      findRoleInOrganization: vi.fn(),
      getBillingPlan: vi.fn(),
    } as unknown as OrganizationStore;

    testProjectId = asPresentationProjectId(randomUUID() as UUID);
    projectStore.seed({
      id: testProjectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "فارماکولوژی ضدالتهاب‌ها: کورتیکواستروئیدها",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
      status: "created",
      currentStage: null,
      totalSlides: 8,
      overallIntroduction: null,
      overallConclusion: null,
      totalEstimatedSeconds: 900,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    testRefId = asPresentationReferenceId(randomUUID() as UUID);

    const slide = await slideStore.createSlide({
      projectId: testProjectId,
      slideIndex: 3,
      title: "مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها",
      rawText: "• گیرنده سیتوپلاسمی GR\n• جداسازی HSP90\n• انتقال به هسته\n• مهار فاکتور رونویسی NF-kB",
      speakerNotes: "توضیح مکانیسم اثر و تفاوت اثر ژنومی و غیرژنومی",
    });
    testSlideId = slide.id;

    service = new PresentationGenerationService({
      projectStore,
      slideStore,
      organizationStore: orgStore,
      gateway,
    });
  });

  async function attachCorticosteroidSnapshot() {
    const snapshot: SlideReferenceContextSnapshot = {
      schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
      generationRunId: randomUUID(),
      selectorVersion: "heuristic-lexical-v1",
      selectedAt: new Date().toISOString(),
      projectId: testProjectId,
      slideIndex: 3,
      totalSelectedTokens: 150,
      chunks: [
        {
          chunkId: chunk1Id,
          referenceId: testRefId,
          sourceType: "pdf",
          sourceTitle: "Goodman & Gilman's Pharmacological Basis of Therapeutics",
          citationLabel: "[1] Goodman & Gilman",
          sourceLocation: { startPage: 850, endPage: 852, slideIndex: null, confidence: "exact" },
          contentHash: chunk1Hash,
          content: chunk1Content,
          selectionScore: 0.95,
          selectionReasons: ["Key receptor match"],
          rank: 1,
        },
        {
          chunkId: chunk2Id,
          referenceId: testRefId,
          sourceType: "pdf",
          sourceTitle: "Goodman & Gilman's Pharmacological Basis of Therapeutics",
          citationLabel: "[2] Goodman & Gilman",
          sourceLocation: { startPage: 853, endPage: 855, slideIndex: null, confidence: "exact" },
          contentHash: chunk2Hash,
          content: chunk2Content,
          selectionScore: 0.92,
          selectionReasons: ["Nuclear translocation match"],
          rank: 2,
        },
      ],
    };

    await slideStore.saveReferenceSnapshot(testSlideId, testProjectId, snapshot);
    return snapshot;
  }

  // ---------------------------------------------------------------------------
  // 1. Schema & Validation Tests
  // ---------------------------------------------------------------------------
  describe("1. Speaker Content Schema Validation", () => {
    it("validates valid PresentationSpeakerContent object with all fields", () => {
      const valid: PresentationSpeakerContent = {
        speechText: "همکاران گرامی، در این اسلاید به بررسی مکانیسم اثر سلولی گلوکوکورتیکوئیدها می‌پردازیم...",
        supplementaryExplanation: "گلوکوکورتیکوئیدها به دلیل ماهیت لیپوفیلیک خود به سادگی از غشای دو لایه فسفولیپیدی عبور می‌کنند.",
        keyPoints: [
          "اتصال به گیرنده داخل سیتوپلاسمی GR",
          "جدا شدن پروتئین‌های شوک حرارتی HSP90",
          "مهار ترانس‌اکتیواسیون فاکتور NF-kB",
        ],
        examPoints: [
          "نکته بورد: شایع‌ترین مکانیسم ضدالتهابی مهار فاکتور رونویسی NF-kB است و نه اثر مستقیم بر سنتز پروستاگلاندین‌ها.",
        ],
        clinicalExample: {
          scenario: "بیمار مبتلا به حمله حاد آسم که پس از تجویز هیدروکورتیزون وریدی، اثرات ضدالتهابی طی ۴ تا ۶ ساعت بروز می‌کند.",
          connectionToSlide: "این تاخیر ۴ تا ۶ ساعته بالینی دقیقا منطبق بر زمان لازم برای رونویسی ژنی در اثرات ژنومیک کورتیکواستروئیدهاست.",
        },
        suggestedDurationSeconds: 110,
        transitionSentence: "حال که مکانیسم مولکولی را شناختیم، در اسلاید بعد به عوارض جانبی سیستمیک ناشی از این مکانیسم‌ها نگاهی می‌اندازیم.",
        citations: [{ chunkId: chunk1Id }, { chunkId: chunk2Id }],
        claims: [
          {
            text: "گلوکوکورتیکوئیدها با گیرنده GR سیتوپلاسمی پیوند برقرار کرده و سبب جدایی HSP90 می‌شوند.",
            chunkIds: [chunk1Id],
            evidenceStatus: "supported",
          },
          {
            text: "کمپلکس هورمون-گیرنده به هسته رفته و فاکتور رونویسی NF-kB را مهار می‌کند.",
            chunkIds: [chunk2Id],
            evidenceStatus: "supported",
          },
        ],
      };

      const parsed = validateSpeakerContentSchema(valid);
      expect(parsed.speechText).toContain("همکاران گرامی");
      expect(parsed.keyPoints).toHaveLength(3);
      expect(parsed.examPoints).toHaveLength(1);
      expect(parsed.clinicalExample?.scenario).toContain("آسم");
      expect(parsed.suggestedDurationSeconds).toBe(110);
      expect(parsed.transitionSentence).toContain("عوارض جانبی");
      expect(parsed.citations).toHaveLength(2);
      expect(parsed.claims).toHaveLength(2);
    });

    it("parses valid JSON string with markdown fences cleanly", () => {
      const rawJson = `\`\`\`json
{
  "speechText": "متن سخنرانی نمونه.",
  "supplementaryExplanation": "توضیحات علمی.",
  "keyPoints": ["نکته یک", "نکته دو"],
  "examPoints": [],
  "clinicalExample": null,
  "suggestedDurationSeconds": 75,
  "citations": [{ "chunkId": "${chunk1Id}" }],
  "claims": [{ "text": "ادعا", "chunkIds": ["${chunk1Id}"], "evidenceStatus": "supported" }]
}
\`\`\``;

      const parsed = validateSpeakerContentSchema(rawJson);
      expect(parsed.speechText).toBe("متن سخنرانی نمونه.");
      expect(parsed.suggestedDurationSeconds).toBe(75);
      expect(parsed.clinicalExample).toBeUndefined();
    });

    it("rejects output missing speechText", () => {
      expect(() =>
        validateSpeakerContentSchema({
          supplementaryExplanation: "توضیح بدون سخنرانی",
          keyPoints: ["نکته"],
          citations: [],
          claims: [],
        }),
      ).toThrow(DomainError);
    });

    it("extracts all unique chunk IDs across claims and citations", () => {
      const content: PresentationSpeakerContent = {
        speechText: "Speech",
        supplementaryExplanation: "Explanation",
        keyPoints: ["KP"],
        examPoints: [],
        suggestedDurationSeconds: 60,
        citations: [{ chunkId: chunk1Id }, { chunkId: chunk2Id }],
        claims: [
          { text: "Claim 1", chunkIds: [chunk1Id], evidenceStatus: "supported" },
          { text: "Claim 2", chunkIds: [chunk2Id], evidenceStatus: "supported" },
        ],
      };

      const extracted = extractAllSpeakerChunkIds(content);
      expect(extracted.allUniqueChunkIds).toEqual([chunk1Id, chunk2Id]);
      expect(extracted.claimChunkIds).toEqual([chunk1Id, chunk2Id]);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Prompt Builder Tests
  // ---------------------------------------------------------------------------
  describe("2. Speaker Prompt Builder", () => {
    it("builds spoken Persian prompt with pedagogical, oral speech and clinical guidelines", async () => {
      const snapshot = await attachCorticosteroidSnapshot();
      const project = (await projectStore.findById(testProjectId))!;
      const slide = (await slideStore.findById(testSlideId, testProjectId))!;

      const prompt = PresentationPromptBuilder.buildSpeakerPrompt({
        project,
        slide,
        snapshot,
        instructions: { language: "fa", academicLevel: "advanced", tone: "formal_scientific" },
        previousSlideSummary: "اسلاید قبلی: مقدمه و طبقه‌بندی کورتیکواستروئیدها",
        nextSlideTitle: "عوارض جانبی کورتیکواستروئیدها",
      });

      expect(prompt.promptVersion).toBe("2026-11-speaker-v1");
      expect(prompt.systemPrompt).toContain("دستیار ارائه علمی آوانا");
      expect(prompt.systemPrompt).toContain("PresentationSpeakerContent");
      expect(prompt.userPrompt).toContain("مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها");
      expect(prompt.userPrompt).toContain(chunk1Id);
      expect(prompt.userPrompt).toContain(chunk2Id);
      expect(prompt.userPrompt).toContain("قوانین نگارش سخنرانی");
      expect(prompt.userPrompt).toContain("ساختار پاراگرافی و لحن حرفه‌ای گفتار (speechText)");
      expect(prompt.userPrompt).toContain("supplementaryExplanation");
      expect(prompt.userPrompt).toContain("clinicalExample");
      expect(prompt.userPrompt).toContain("examPoints");
      expect(prompt.userPrompt).toContain("Previous Slide Context: اسلاید قبلی");
      expect(prompt.userPrompt).toContain("Next Slide Topic (for transitionSentence): عوارض جانبی");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Server Citation Validator for Speaker Content
  // ---------------------------------------------------------------------------
  describe("3. Citation Grounding for Speaker Content", () => {
    it("validates successfully when all speaker claims and citations match snapshot", async () => {
      await attachCorticosteroidSnapshot();
      const validator = new ServerCitationValidator({ slideStore, projectStore });

      const content: PresentationSpeakerContent = {
        speechText: "متن سخنرانی دقیق علمی.",
        supplementaryExplanation: "توضیحات تکمیلی.",
        keyPoints: ["نکته ۱"],
        examPoints: ["نکته تستی"],
        suggestedDurationSeconds: 90,
        citations: [{ chunkId: chunk1Id }, { chunkId: chunk2Id }],
        claims: [
          { text: "ادعای اول", chunkIds: [chunk1Id], evidenceStatus: "supported" },
          { text: "ادعای دوم", chunkIds: [chunk2Id], evidenceStatus: "supported" },
        ],
      };

      const result = await validator.validateSpeakerContent({
        projectId: testProjectId,
        slideId: testSlideId,
        content,
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
      expect(result.authoritativeContent?.citations[0].referenceId).toBe(testRefId);
    });

    it("rejects hallucinated chunkId not in snapshot (chunk_not_in_slide_context)", async () => {
      await attachCorticosteroidSnapshot();
      const validator = new ServerCitationValidator({ slideStore, projectStore });

      const content: PresentationSpeakerContent = {
        speechText: "متن سخنرانی با ارجاع جعلی.",
        supplementaryExplanation: "",
        keyPoints: [],
        examPoints: [],
        suggestedDurationSeconds: 60,
        citations: [{ chunkId: "fake-chunk-999" }],
        claims: [
          { text: "ادعا با منبع ناموجود", chunkIds: ["fake-chunk-999"], evidenceStatus: "supported" },
        ],
      };

      const result = await validator.validateSpeakerContent({
        projectId: testProjectId,
        slideId: testSlideId,
        content,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("chunk_not_in_slide_context");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. End-to-End Generation Pipeline & Invariant Verification
  // ---------------------------------------------------------------------------
  describe("4. End-to-End Generation & Persistence Invariants", () => {
    it("generates speech, updates speaker_notes, populates extractionMetadata, and preserves rawText", async () => {
      await attachCorticosteroidSnapshot();

      const initialSlide = (await slideStore.findById(testSlideId, testProjectId))!;
      const originalRawText = initialSlide.rawText;
      expect(originalRawText).toContain("گیرنده سیتوپلاسمی GR");

      const mockSpeech: PresentationSpeakerContent = {
        speechText: "اساتید محترم، همان‌طور که در تصویر مشاهده می‌کنید، گلوکوکورتیکوئیدها ابتدا به گیرنده سیتوپلاسمی GR متصل می‌شوند. در ادامه این اتصال موجب جدا شدن HSP90 شده و کمپلکس هورمون-گیرنده به هسته منتقل می‌شود تا مهار NF-kB در هسته را رقم بزند.",
        supplementaryExplanation: "اثرات مهاری بر سنتز اینترلوکین-۱ و اینترلوکین-۲ از طریق اینترکشن هسته‌ای با NF-kB رخ می‌دهد.",
        keyPoints: [
          "اتصال به GR سیتوپلاسمی",
          "جدا شدن HSP90",
          "مهار NF-kB در هسته",
        ],
        examPoints: [
          "سؤال پرتکرار دستیاری: تفاوت زمان اثر گلوکوکورتیکوئیدها (اثرات ژنومیک چند ساعت طول می‌کشد).",
        ],
        clinicalExample: {
          scenario: "تجویز پردنیزولون خوراکی در کرون یا کولیت اولسراتیو حاد.",
          connectionToSlide: "سرکوب رونویسی سایتوکاین‌های التهابی در روده از طریق مهار NF-kB صورت می‌گیرد.",
        },
        suggestedDurationSeconds: 120,
        transitionSentence: "پس از بررسی این اثرات داخل سلولی، اکنون به کاربردهای درمانی آن می‌پردازیم.",
        citations: [{ chunkId: chunk1Id }, { chunkId: chunk2Id }],
        claims: [
          {
            text: "گلوکوکورتیکوئیدها به GR متصل شده و HSP90 را جدا می‌کنند.",
            chunkIds: [chunk1Id],
            evidenceStatus: "supported",
          },
          {
            text: "کمپلکس هورمون-گیرنده به هسته رفته و NF-kB را مهار می‌کند.",
            chunkIds: [chunk2Id],
            evidenceStatus: "supported",
          },
        ],
      };

      gateway.completeHandler = async () => ({
        text: JSON.stringify(mockSpeech),
        model: PRESENTATION_CANONICAL_MODEL,
        usage: { inputTokens: 250, outputTokens: 350 },
        finishReason: "stop",
      });

      const result = await service.generateSlide({
        actor: testActor,
        projectId: testProjectId,
        slideId: testSlideId,
      });

      expect(result.status).toBe("accepted");
      expect(result.repairAttempted).toBe(false);
      expect(result.speechContent).toBeDefined();
      expect(result.speechContent?.speechText).toContain("اساتید محترم");
      expect(result.speechContent?.examPoints).toHaveLength(1);
      expect(result.speechContent?.clinicalExample?.scenario).toContain("پردنیزولون");

      // Verify Database Slide Record
      const updatedSlide = (await slideStore.findById(testSlideId, testProjectId))!;

      // INVARIANT 1: rawText MUST REMAIN UNTOUCHED!
      expect(updatedSlide.rawText).toBe(originalRawText);

      // INVARIANT 2: original PPTX speaker_notes must NOT be overwritten by generated speech!
      expect(updatedSlide.speakerNotes).toBe("توضیح مکانیسم اثر و تفاوت اثر ژنومی و غیرژنومی");

      // INVARIANT 3: extractionMetadata stores the full structured speech content
      const storedSpeech = updatedSlide.extractionMetadata.speechContent as PresentationSpeakerContent;
      expect(storedSpeech).toBeDefined();
      expect(storedSpeech.speechText).toBe(mockSpeech.speechText);
      expect(storedSpeech.supplementaryExplanation).toContain("اینترلوکین");
      expect(storedSpeech.examPoints).toEqual(mockSpeech.examPoints);
      expect(storedSpeech.clinicalExample).toEqual(mockSpeech.clinicalExample);
      expect(storedSpeech.suggestedDurationSeconds).toBe(120);

      // INVARIANT 4: Model attribute strictly recorded
      expect(updatedSlide.extractionMetadata.model).toBe(PRESENTATION_CANONICAL_MODEL);
    });

    it("successfully repairs invalid citation in speaker content on second attempt", async () => {
      await attachCorticosteroidSnapshot();

      let callCount = 0;
      gateway.completeHandler = async () => {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: Model hallucinates a chunk ID
          return {
            text: JSON.stringify({
              speechText: "متن سخنرانی با ارجاع اشتباه.",
              supplementaryExplanation: "توضیح",
              keyPoints: ["نکته"],
              examPoints: [],
              suggestedDurationSeconds: 90,
              citations: [{ chunkId: "hallucinated-chunk-999" }],
              claims: [
                {
                  text: "ادعای حاوی ارجاع نامعتبر",
                  chunkIds: ["hallucinated-chunk-999"],
                  evidenceStatus: "supported",
                },
              ],
            }),
            model: PRESENTATION_CANONICAL_MODEL,
            usage: { inputTokens: 150, outputTokens: 150 },
            finishReason: "stop",
          };
        } else {
          // Attempt 2 (Repair): Model maps claim to valid allowlist chunk1Id!
          return {
            text: JSON.stringify({
              speechText: "متن سخنرانی اصلاح‌شده با رعایت نکته کلیدی.",
              supplementaryExplanation: "توضیح اصلاح‌شده",
              keyPoints: ["نکته کلیدی"],
              examPoints: [],
              suggestedDurationSeconds: 90,
              citations: [{ chunkId: chunk1Id }],
              claims: [
                {
                  text: "ادعای اصلاح‌شده با منبع مجاز",
                  chunkIds: [chunk1Id],
                  evidenceStatus: "supported",
                },
              ],
            }),
            model: PRESENTATION_CANONICAL_MODEL,
            usage: { inputTokens: 180, outputTokens: 180 },
            finishReason: "stop",
          };
        }
      };

      const result = await service.generateSlide({
        actor: testActor,
        projectId: testProjectId,
        slideId: testSlideId,
      });

      expect(callCount).toBe(2);
      expect(result.repairAttempted).toBe(true);
      expect(result.status).toBe("accepted");
      expect(result.speechContent?.citations[0].chunkId).toBe(chunk1Id);

      const slide = (await slideStore.findById(testSlideId, testProjectId))!;
      // Original speakerNotes preserved; generated speech stored in extractionMetadata
      expect(slide.speakerNotes).toBe("توضیح مکانیسم اثر و تفاوت اثر ژنومی و غیرژنومی");
      expect((slide.extractionMetadata.speechContent as PresentationSpeakerContent).speechText).toBe("متن سخنرانی اصلاح‌شده با رعایت نکته کلیدی.");
    });
  });
});
