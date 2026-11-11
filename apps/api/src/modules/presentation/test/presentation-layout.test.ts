import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  type Actor,
  type AssembledTableBlock,
  type AssembledStatBlock,
  type AssembledQuoteBlock,
  type GeneratedPresentationSlide,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationReferenceId,
  type SlideReferenceContextSnapshot,
  type SnapshotReferenceChunk,
  type UUID,
  asOrganizationId,
  asPresentationProjectId,
  asPresentationReferenceId,
  asUserId,
  DomainError,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
  verifyStrictClaimPreservation,
  PRESENTATION_LAYOUT_METADATA_KEY,
} from "@avana/domain";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { InMemoryPresentationProjectStore } from "../in-memory-presentation-store.js";
import { PresentationLayoutSelector } from "../presentation-layout-selector.js";
import { PresentationComponentAssembler } from "../presentation-component-assembler.js";
import { PresentationLayoutService } from "../presentation-layout-service.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

describe("Slide Presentation Layout Synthesis & Component Assembler (Phase 2A-2.3d)", () => {
  let slideStore: InMemoryPresentationSlideStore;
  let projectStore: InMemoryPresentationProjectStore;
  let orgStore: OrganizationStore;
  let layoutService: PresentationLayoutService;

  let testOrgId: OrganizationId;
  let testUserId: Actor["userId"];
  let testActor: Actor;
  let testProjectId: PresentationProjectId;
  let testRefId: PresentationReferenceId;

  const chunk1Id = "refchunk_ref1_0_abcd1234";
  const chunk1Content = "وارفارین یک داروی ضد انعقاد است.";
  const chunk1Hash = createHash("sha256").update(chunk1Content, "utf8").digest("hex");

  const chunk2Id = "refchunk_ref1_1_efgh5678";
  const chunk2Content = "دوز استاندارد وارفارین نیازمند پایش منظم INR است.";
  const chunk2Hash = createHash("sha256").update(chunk2Content, "utf8").digest("hex");

  let testSnapshot: SlideReferenceContextSnapshot;

  beforeEach(() => {
    slideStore = new InMemoryPresentationSlideStore();
    projectStore = new InMemoryPresentationProjectStore();

    testOrgId = asOrganizationId(randomUUID() as UUID);
    testUserId = asUserId(randomUUID() as UUID);
    testActor = {
      userId: testUserId,
      role: "organization_admin",
      globalRole: null,
    };

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
      title: "دوره جامع فارماکولوژی بالینی",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "completed",
      currentStage: null,
      totalSlides: 5,
      overallIntroduction: null,
      overallConclusion: null,
      totalEstimatedSeconds: 900,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    testRefId = asPresentationReferenceId(randomUUID() as UUID);

    const snapshotChunks: SnapshotReferenceChunk[] = [
      {
        chunkId: chunk1Id,
        referenceId: testRefId,
        sourceType: "pdf",
        sourceTitle: "کتاب مرجع فارماکولوژی کاتزونگ",
        citationLabel: "[1] Katzung (2024)",
        sourceLocation: {
          startPage: 340,
          endPage: 342,
          slideIndex: 1,
          confidence: "exact",
        },
        contentHash: chunk1Hash,
        content: chunk1Content,
        selectionScore: 0.95,
        selectionReasons: ["تطابق با عنوان اسلاید"],
        rank: 1,
      },
      {
        chunkId: chunk2Id,
        referenceId: testRefId,
        sourceType: "pdf",
        sourceTitle: "کتاب مرجع فارماکولوژی کاتزونگ",
        citationLabel: "[2] Katzung (2024)",
        sourceLocation: {
          startPage: 343,
          endPage: 344,
          slideIndex: 2,
          confidence: "exact",
        },
        contentHash: chunk2Hash,
        content: chunk2Content,
        selectionScore: 0.88,
        selectionReasons: ["پایش INR"],
        rank: 2,
      },
    ];

    testSnapshot = {
      schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
      generationRunId: "run-test-1",
      selectorVersion: "test-v1",
      selectedAt: new Date().toISOString(),
      projectId: testProjectId,
      slideIndex: 1,
      chunks: snapshotChunks,
      totalSelectedTokens: 450,
    };

    layoutService = new PresentationLayoutService({
      projectStore,
      slideStore,
      organizationStore: orgStore,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Discriminator & Type Narrowing Invariants
  // -------------------------------------------------------------------------
  describe("1. Discriminator and Type Narrowing Invariants", () => {
    it("preserves sourceType and provides distinct kind for every block", () => {
      const slide: GeneratedPresentationSlide = {
        title: "بررسی بالینی",
        content: [
          {
            type: "text",
            content: "«وارفارین سنگ بنای درمان ضد انعقاد است.» — گایدلاین بالینی",
            claims: [],
          },
        ],
        speakerNotes: "یادداشت تست",
        citations: [],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      expect(assembly.body.blocks).toHaveLength(1);
      const block = assembly.body.blocks[0];

      expect(block.sourceType).toBe("text");
      expect(block.kind).toBe("quote");

      // Verify clean TypeScript discriminated switch without casts
      switch (block.kind) {
        case "quote": {
          const q: AssembledQuoteBlock = block;
          expect(q.quoteText).toContain("وارفارین سنگ بنای درمان ضد انعقاد است");
          expect(q.attribution).toBe("گایدلاین بالینی");
          break;
        }
        default:
          throw new Error("Expected quote block");
      }
    });

    it("discriminates statistic_highlight block with metricValue and metricLabel", () => {
      const slide: GeneratedPresentationSlide = {
        title: "اثربخشی درمان",
        content: [
          {
            type: "text",
            content: "75%: کاهش خطر سکته مغزی در بیماران مبتلا به فیبریلاسیون دهلیزی.",
            claims: [
              {
                text: "کاهش 75 درصدی خطر سکته",
                chunkIds: [chunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: chunk1Id }],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      expect(assembly.layoutType).toBe("statistic_highlight");
      const block = assembly.body.blocks[0];
      expect(block.sourceType).toBe("text");
      expect(block.kind).toBe("statistic_highlight");

      if (block.kind === "statistic_highlight") {
        const stat: AssembledStatBlock = block;
        expect(stat.metricValue).toBe("75%");
        expect(stat.metricLabel).toContain("کاهش خطر سکته مغزی");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Strict Content Ordering Invariants
  // -------------------------------------------------------------------------
  describe("2. Strict Content Ordering Invariants", () => {
    it("preserves exact sourceIndex sequence (text, table, text) without reordering", () => {
      const slide: GeneratedPresentationSlide = {
        title: "بررسی مقایسه‌ای داروهای ضد انعقاد",
        content: [
          {
            type: "text",
            content: "مقدمه: در این جدول مقایسه فارماکوکینتیک وارفارین و ریواروکسابان آورده شده است.",
            claims: [],
          },
          {
            type: "table",
            content: "| دارو | نیمه‌عمر | پایش |\n|---|---|---|\n| وارفارین | ۴۰ ساعت | نیاز دارد |\n| ریواروکسابان | ۱۰ ساعت | نیاز ندارد |",
            claims: [
              {
                text: "نیمه عمر وارفارین ۴۰ ساعت است",
                chunkIds: [chunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
          {
            type: "text",
            content: "توضیح تکمیلی: انتخاب دارو بستگی به عملکرد کلیوی بیمار دارد.",
            claims: [],
          },
        ],
        speakerNotes: "توضیحات تکمیلی ارائه شود.",
        citations: [{ chunkId: chunk1Id }],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      // Layout type is table due to P1 priority
      expect(assembly.layoutType).toBe("table");

      // Verify exact 1:1 ordering: blocks[i].sourceIndex === i
      expect(assembly.body.blocks).toHaveLength(3);
      expect(assembly.body.blocks[0].sourceIndex).toBe(0);
      expect(assembly.body.blocks[0].kind).toBe("text");
      expect(assembly.body.blocks[0].rawContent).toContain("مقدمه");

      expect(assembly.body.blocks[1].sourceIndex).toBe(1);
      expect(assembly.body.blocks[1].kind).toBe("table");
      expect(assembly.body.blocks[1].rawContent).toContain("| وارفارین |");

      expect(assembly.body.blocks[2].sourceIndex).toBe(2);
      expect(assembly.body.blocks[2].kind).toBe("text");
      expect(assembly.body.blocks[2].rawContent).toContain("توضیح تکمیلی");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Table Formatting & Character Fidelity Invariants
  // -------------------------------------------------------------------------
  describe("3. Table Formatting and Character Fidelity Invariants", () => {
    it("preserves Persian ZWNJ, Latin formulas, units, and empty cells without trim loss", () => {
      const rawTable = [
        "| پارامتر | مقدار بالینی | واحد سنجش | وضعیت |",
        "|---|:---:|---|---|",
        "| نیمه‌عمر وارفارین | 40 ± 2 | ساعت | تأیید شده |",
        "| سطح سرمی ($p < 0.05$) | 2.5 | mg/dL |  |",
        "| دوز نگهدارنده\u200Cدارو | 5 | mg/day | نرمال |",
      ].join("\n");

      const slide: GeneratedPresentationSlide = {
        title: "جدول داده‌های فارماکوکینتیک",
        content: [
          {
            type: "table",
            content: rawTable,
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      const block = assembly.body.blocks[0] as AssembledTableBlock;
      expect(block.kind).toBe("table");
      expect(block.rawContent).toBe(rawTable);

      // Verify headers
      expect(block.headers).toEqual(["پارامتر", "مقدار بالینی", "واحد سنجش", "وضعیت"]);

      // Verify rows preservation
      expect(block.rows).toHaveLength(3);

      // Row 1: Numbers with symbols
      expect(block.rows[0]).toEqual(["نیمه‌عمر وارفارین", "40 ± 2", "ساعت", "تأیید شده"]);

      // Row 2: Latin formula ($p < 0.05$), unit (mg/dL), empty cell preserved as empty string
      expect(block.rows[1]).toEqual(["سطح سرمی ($p < 0.05$)", "2.5", "mg/dL", ""]);

      // Row 3: Persian ZWNJ (\u200C) preserved
      expect(block.rows[2][0]).toBe("دوز نگهدارنده\u200Cدارو");
      expect(block.rows[2][1]).toBe("5");
      expect(block.rows[2][2]).toBe("mg/day");
      expect(block.rows[2][3]).toBe("نرمال");

      // Verify column alignments
      expect(block.columnAlignments).toEqual(["right", "center", "right", "right"]);
    });

    it("handles table without headers cleanly without synthetic header invention", () => {
      const rawTable = [
        "| داده ۱ | داده ۲ |",
        "| داده ۳ | داده ۴ |",
      ].join("\n");

      const slide: GeneratedPresentationSlide = {
        title: "جدول بدون هدر",
        content: [
          {
            type: "table",
            content: rawTable,
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      const block = assembly.body.blocks[0] as AssembledTableBlock;
      expect(block.headers).toEqual([]);
      expect(block.rows).toHaveLength(2);
      expect(block.rows[0]).toEqual(["داده ۱", "داده ۲"]);
      expect(block.rows[1]).toEqual(["داده ۳", "داده ۴"]);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Citation Grounding & Multiplicity Invariants
  // -------------------------------------------------------------------------
  describe("4. Citation Grounding and Multiplicity Invariants", () => {
    it("fails assembly immediately if a claim references an unknown chunkId", () => {
      const slide: GeneratedPresentationSlide = {
        title: "خطای استناد",
        content: [
          {
            type: "text",
            content: "ادعایی با منبع نامعتبر.",
            claims: [
              {
                text: "ادعا",
                chunkIds: ["refchunk_unknown_999"],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      expect(() =>
        PresentationComponentAssembler.assemble({
          projectId: testProjectId,
          slideIndex: 2,
          slide,
          snapshot: testSnapshot,
        }),
      ).toThrow(DomainError);
    });

    it("fails assembly immediately if a slide-level citation references an unknown chunkId", () => {
      const slide: GeneratedPresentationSlide = {
        title: "خطای استناد اسلاید",
        content: [
          {
            type: "text",
            content: "متن اسلاید بدون ادعا.",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: "refchunk_nonexistent_888" }],
      };

      expect(() =>
        PresentationComponentAssembler.assemble({
          projectId: testProjectId,
          slideIndex: 2,
          slide,
          snapshot: testSnapshot,
        }),
      ).toThrow(DomainError);
    });

    it("preserves exact chunkIds, order, and multiplicity (duplicate chunkIds)", () => {
      const slide: GeneratedPresentationSlide = {
        title: "تکرار منابع",
        content: [
          {
            type: "bullet_list",
            content: "* نکته اول\n* نکته دوم",
            claims: [
              {
                text: "ادعای تکراری",
                chunkIds: [chunk1Id, chunk1Id, chunk2Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: chunk1Id }],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      const claim = assembly.body.blocks[0].claims[0];
      expect(claim.chunkIds).toEqual([chunk1Id, chunk1Id, chunk2Id]);
      expect(claim.citationLabels).toEqual([
        "[1] Katzung (2024)",
        "[1] Katzung (2024)",
        "[2] Katzung (2024)",
      ]);

      // Footer citations deduplicates for bibliography and sorts by rank
      expect(assembly.footer.citations).toHaveLength(2);
      expect(assembly.footer.citations[0].chunkId).toBe(chunk1Id);
      expect(assembly.footer.citations[0].rank).toBe(1);
      expect(assembly.footer.citations[1].chunkId).toBe(chunk2Id);
      expect(assembly.footer.citations[1].rank).toBe(2);
    });

    it("verifyStrictClaimPreservation catches mutated text or dropped chunkId", () => {
      const slide: GeneratedPresentationSlide = {
        title: "آزمون اینواریانت",
        content: [
          {
            type: "text",
            content: "متن اصلی",
            claims: [
              {
                text: "ادعای معتبر",
                chunkIds: [chunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: chunk1Id }],
      };

      const assembly = PresentationComponentAssembler.assemble({
        projectId: testProjectId,
        slideIndex: 2,
        slide,
        snapshot: testSnapshot,
      });

      // Passes with untouched assembly
      expect(() => verifyStrictClaimPreservation(slide, assembly)).not.toThrow();

      // Mutate claim text -> must throw
      const tamperedTextAssembly = JSON.parse(JSON.stringify(assembly));
      tamperedTextAssembly.body.blocks[0].claims[0].text = "متن تغییر یافته!";
      expect(() =>
        verifyStrictClaimPreservation(slide, tamperedTextAssembly),
      ).toThrow(DomainError);

      // Mutate chunkIds multiplicity -> must throw
      const tamperedChunkAssembly = JSON.parse(JSON.stringify(assembly));
      tamperedChunkAssembly.body.blocks[0].claims[0].chunkIds = [];
      expect(() =>
        verifyStrictClaimPreservation(slide, tamperedChunkAssembly),
      ).toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Deterministic Layout Priority Ladder & Overlaps
  // -------------------------------------------------------------------------
  describe("5. Deterministic Layout Priority Ladder and Overlaps", () => {
    it("P1 Table wins over conclusion on final slide", () => {
      const slide: GeneratedPresentationSlide = {
        title: "نتیجه‌گیری و جمع‌بندی داده‌ها",
        content: [
          {
            type: "table",
            content: "| تست | نتیجه |\n|---|---|\n| ۱ | مثبت |",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 5,
        totalSlides: 5,
        isTerminalSlide: true,
      });

      expect(result.layoutType).toBe("table");
      expect(result.reasons[0]).toContain("Slide contains tabular data");
    });

    it("P2 Title selects title hero for minimal slide 1", () => {
      const slide: GeneratedPresentationSlide = {
        title: "مبانی فارماکولوژی بالینی",
        subtitle: "جلسه اول: آشنایی با ضد انعقادها",
        content: [
          {
            type: "text",
            content: "ارائه دهنده: دکتر علوی",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 1,
        totalSlides: 5,
      });

      expect(result.layoutType).toBe("title");
    });

    it("P2 Substantive Slide 1 with bullets falls through to bullet_list", () => {
      const slide: GeneratedPresentationSlide = {
        title: "مقدمه و اهداف آموزشی",
        content: [
          {
            type: "bullet_list",
            content: "* آشنایی با مسیر انعقاد خون\n* نحوه اثر داروی وارفارین\n* پروتکل تنظیم دوز بر اساس INR",
            claims: [
              {
                text: "مسیر انعقاد خون و وارفارین",
                chunkIds: [chunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: chunk1Id }],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 1,
        totalSlides: 5,
      });

      // Must NOT be title hero because it has substantive bullet content and claims
      expect(result.layoutType).toBe("bullet_list");
    });

    it("P3 Conclusion selects conclusion layout for terminal slide without table", () => {
      const slide: GeneratedPresentationSlide = {
        title: "جمع‌بندی نکات کلیدی",
        content: [
          {
            type: "bullet_list",
            content: "* پایش INR اساسی است\n* توجه به تداخلات دارویی",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 5,
        totalSlides: 5,
        isTerminalSlide: true,
      });

      expect(result.layoutType).toBe("conclusion");
    });

    it("P4 Two-Column selects two_column for exactly 2 balanced content items", () => {
      const slide: GeneratedPresentationSlide = {
        title: "مقایسه مزایا و معایب",
        content: [
          {
            type: "bullet_list",
            content: "* اثربخشی اثبات شده\n* هزینه پایین",
            claims: [],
          },
          {
            type: "bullet_list",
            content: "* نیاز به پایش مداوم\n* تداخل با ویتامین K",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 3,
        totalSlides: 5,
      });

      expect(result.layoutType).toBe("two_column");
    });

    it("P5 Quote with numbers takes precedence over statistic_highlight", () => {
      const slide: GeneratedPresentationSlide = {
        title: "دیدگاه گایدلاین بالینی",
        content: [
          {
            type: "text",
            content: "«کاهش دوز وارفارین به میزان 50% در بیماران با خونریزی حاد توصیه می‌شود.» — AHA/ACC Guidelines",
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 3,
        totalSlides: 5,
      });

      expect(result.layoutType).toBe("quote");
    });

    it("P7 Long bullet list (> 6 items) remains single list with compact density", () => {
      const bullets = [
        "* مورد اول",
        "* مورد دوم",
        "* مورد سوم",
        "* مورد چهارم",
        "* مورد پنجم",
        "* مورد ششم",
        "* مورد هفتم",
        "* مورد هشتم",
      ].join("\n");

      const slide: GeneratedPresentationSlide = {
        title: "فهرست طولانی تداخلات",
        content: [
          {
            type: "bullet_list",
            content: bullets,
            claims: [],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const result = PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex: 3,
        totalSlides: 5,
      });

      expect(result.layoutType).toBe("bullet_list");
      expect(result.density).toBe("compact");
    });
  });

  // -------------------------------------------------------------------------
  // 6. Persistence, OCC & Precise Idempotence
  // -------------------------------------------------------------------------
  describe("6. Persistence, Optimistic Concurrency and Precise Idempotence", () => {
    it("persists assembled layout and updates extractionMetadata safely", async () => {
      const acceptedSlide: GeneratedPresentationSlide = {
        title: "فارماکوکینتیک بالینی",
        content: [
          {
            type: "bullet_list",
            content: "* جذب سریع گوارشی\n* اتصال ۹۹ درصدی به پروتئین‌های پلاسما",
            claims: [
              {
                text: "اتصال به پروتئین پلاسما",
                chunkIds: [chunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "توضیح کامل اتصال پروتئینی",
        citations: [{ chunkId: chunk1Id }],
      };

      // Create slide with accepted generation metadata and snapshot
      const createdSlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: acceptedSlide.title,
        extractionMetadata: {
          generationStatus: "accepted",
          generatedSlide: acceptedSlide,
          [PRESENTATION_LAYOUT_METADATA_KEY]: undefined,
        },
      });

      await slideStore.saveReferenceSnapshot(createdSlide.id, testProjectId, testSnapshot);

      const result1 = await layoutService.assembleAndPersistLayout({
        actor: testActor,
        projectId: testProjectId,
        slideId: createdSlide.id,
      });

      expect(result1.persisted).toBe(true);
      expect(result1.assembly.layoutType).toBe("bullet_list");
      expect(result1.assembly.header.title).toBe("فارماکوکینتیک بالینی");
      expect(result1.assembly.metadata.totalClaims).toBe(1);

      // Verify slideStore persistence
      const stored = await slideStore.findById(createdSlide.id, testProjectId);
      expect(stored?.extractionMetadata[PRESENTATION_LAYOUT_METADATA_KEY]).toBeDefined();
      expect(stored?.extractionMetadata.generatedSlide).toEqual(acceptedSlide);

      // 2. Second assembly without changes: Idempotence preserves assembledAt
      const result2 = await layoutService.assembleAndPersistLayout({
        actor: testActor,
        projectId: testProjectId,
        slideId: createdSlide.id,
      });

      expect(result2.persisted).toBe(false);
      expect(result2.assembly.metadata.assembledAt).toBe(result1.assembly.metadata.assembledAt);
    });

    it("rejects layout assembly if slide is missing accepted generated content", async () => {
      const emptySlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 2,
        title: "اسلاید خالی بدون تولید",
      });

      await expect(
        layoutService.assembleAndPersistLayout({
          actor: testActor,
          projectId: testProjectId,
          slideId: emptySlide.id,
        }),
      ).rejects.toThrow(DomainError);
    });

    it("rejects layout assembly if slide is missing reference snapshot", async () => {
      const slideWithoutSnapshot = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 3,
        title: "بدون اسنپ‌شات",
        extractionMetadata: {
          generationStatus: "accepted",
          generatedSlide: {
            title: "تست",
            content: [{ type: "text", content: "متن", claims: [] }],
            speakerNotes: "",
            citations: [],
          },
        },
      });

      await expect(
        layoutService.assembleAndPersistLayout({
          actor: testActor,
          projectId: testProjectId,
          slideId: slideWithoutSnapshot.id,
        }),
      ).rejects.toThrow(DomainError);
    });
  });
});
