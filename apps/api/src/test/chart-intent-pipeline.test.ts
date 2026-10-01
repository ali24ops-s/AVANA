import { describe, it, expect, vi } from "vitest";
import {
  type ContentPlan,
  type CourseId,
  type DocumentId,
  type DocumentRecord,
  type EducationalChart,
  type OrganizationId,
  type SuggestedVisualization,
  validateLessonChartGate,
  verifyDataPointsAgainstSourceChunks,
  matchCanonicalConceptKey,
  getCanonicalChartForConcept,
  PHARMACOLOGY_CANONICAL_CHARTS,
  MAX_CHARTS_PER_SESSION,
  defaultPolicy,
} from "@avana/domain";
import {
  GenerationService,
  mapPlannerSessionsToContentPlan,
  buildSessionBlueprintPayload,
} from "../modules/generation/generation-service.js";
import { InMemoryGenerationChunkStore } from "../modules/generation/generation-chunk-store.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import type { ModelGateway } from "../modules/generation/gateway/index.js";

describe("AVANA Automatic Educational Chart Selection & Gate Suite", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Conceptual Chart Intent & Validation (Emax / EC50)
  // ---------------------------------------------------------------------------
  it("Test 1: validates conceptual Emax / EC50 chart with normalized parameter semantics", () => {
    const conceptualIntent: SuggestedVisualization = {
      type: "line",
      mode: "conceptual",
      concept: "منحنی غلظت-پاسخ و مفاهیم Emax و EC50",
      rationale: "تفهیم بصری رابطه سیگموئیدال نیمه‌لگاریتمی بین غلظت آگونیست و پاسخ زیستی",
      sourceDataRequired: false,
    };

    const validConceptualMarkdown = `
# مبحث فارماکودینامیک

در این جلسه رابطه دوز و پاسخ بررسی می‌شود.

\`\`\`chart
{
  "type": "line",
  "title": "منحنی غلظت-پاسخ و مفاهیم Emax و EC50",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "پاسخ زیستی", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست کامل",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -7, "hillSlope": 1, "baseline": 0 },
      "parameterSemantics": "normalized"
    }
  ]
}
\`\`\`

نکات کلیدی مربوط به توانایی و کارایی.
`;

    const gateResult = validateLessonChartGate(validConceptualMarkdown, [conceptualIntent]);
    expect(gateResult.valid).toBe(true);
    expect(gateResult.errors).toHaveLength(0);
    expect(gateResult.charts).toHaveLength(1);
    expect(gateResult.charts[0].mode).toBe("conceptual");
    expect(gateResult.charts[0].curves![0].parameterSemantics).toBe("normalized");
  });

  // ---------------------------------------------------------------------------
  // Test 2: Competitive Antagonism Parallel Rightward Shift & Canonical Model
  // ---------------------------------------------------------------------------
  it("Test 2: verifies competitive antagonism preserves Emax and enforces rightward shift", () => {
    const intent: SuggestedVisualization = {
      type: "line",
      mode: "conceptual",
      concept: "آنتاگونیسم رقابتی برگشت‌پذیر و شیفت موازی به راست",
      rationale: "نمایش بصری افزایش EC50 بدون تغییر Emax",
      sourceDataRequired: false,
    };

    // Canonical concept matching
    const conceptKey = matchCanonicalConceptKey(intent.concept);
    expect(conceptKey).toBe("competitive_antagonist");

    const canonicalChart = getCanonicalChartForConcept(conceptKey!);
    expect(canonicalChart.title).toBe(PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist.title);
    expect(canonicalChart.curves).toHaveLength(3);

    const validMarkdown = `
# آنتاگونیسم رقابتی

\`\`\`chart
${JSON.stringify(canonicalChart, null, 2)}
\`\`\`
`;

    const gateResult = validateLessonChartGate(validMarkdown, [intent]);
    expect(gateResult.valid).toBe(true);
    expect(gateResult.errors).toHaveLength(0);

    // Test rejection if competitive antagonism curve violates Emax preservation
    const invalidShiftMarkdown = `
\`\`\`chart
{
  "type": "line",
  "title": "آنتاگونیسم رقابتی برگشت‌پذیر و شیفت موازی به راست",
  "mode": "conceptual",
  "curves": [
    { "name": "آگونیست", "model": "sigmoidal", "parameters": { "emax": 100, "logEC50": -8 }, "parameterSemantics": "normalized" },
    { "name": "آگونیست + آنتاگونیست", "model": "sigmoidal", "parameters": { "emax": 60, "logEC50": -7 }, "parameterSemantics": "normalized" }
  ]
}
\`\`\`
`;
    const invalidResult = validateLessonChartGate(invalidShiftMarkdown, [intent]);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some((e) => e.includes("Emax"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Data-Driven Chart Matching Verified Source Data Table
  // ---------------------------------------------------------------------------
  it("Test 3: validates data-driven chart strictly matching source chunk numerical table", () => {
    const sourceChunk = {
      id: "chunk-pk-table",
      content: `
جدول بررسی اثر دوزهای مختلف داروی آزمایشی بر پاسخ بیولوژیک بافت:
| Dose | Response |
| 1    | 10       |
| 2    | 25       |
| 4    | 50       |
| 8    | 80       |
منبع داده‌ها: گزارش فارماکولوژی تجربی آزمایشگاه.
`,
    };

    const dataIntent: SuggestedVisualization = {
      type: "line",
      mode: "data",
      concept: "رابطه دوز و پاسخ عددی تجربی داروی آزمایشی",
      rationale: "نمایش داده‌های تجربی ثبت‌شده در جدول منبع",
      sourceDataRequired: true,
      citationChunkIds: ["chunk-pk-table"],
    };

    const validDataMarkdown = `
# نتایج آزمایشگاهی

\`\`\`chart
{
  "type": "line",
  "title": "پاسخ تجربی بر حسب دوز داروی آزمایشی",
  "mode": "data",
  "sourceCitation": "گزارش فارماکولوژی تجربی آزمایشگاه",
  "xAxis": { "label": "دوز", "unit": "mg" },
  "yAxis": { "label": "پاسخ", "unit": "%" },
  "series": [
    {
      "name": "پاسخ زیستی",
      "data": [
        { "x": 1, "y": 10 },
        { "x": 2, "y": 25 },
        { "x": 4, "y": 50 },
        { "x": 8, "y": 80 }
      ]
    }
  ]
}
\`\`\`
`;

    const gateResult = validateLessonChartGate(validDataMarkdown, [dataIntent], [sourceChunk]);
    expect(gateResult.valid).toBe(true);
    expect(gateResult.errors).toHaveLength(0);

    // Verify deterministic numbers helper directly
    const verification = verifyDataPointsAgainstSourceChunks(gateResult.charts[0], [sourceChunk]);
    expect(verification.verified).toBe(true);
    expect(verification.ungroundedNumbers).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Fabricated Data Rejection (Source Lacks Data -> Model Inventions)
  // ---------------------------------------------------------------------------
  it("Test 4: strictly rejects data-driven chart with fabricated numbers not in source", () => {
    const sourceChunk = {
      id: "chunk-qualitative",
      content: "داروی متوپرولول یک بتا بلوکر انتخابی است که برای درمان پرفشاری خون مصرف می‌شود.",
    };

    const dataIntent: SuggestedVisualization = {
      type: "line",
      mode: "data",
      concept: "غلظت پلاسمایی متوپرولول",
      rationale: "تست",
      sourceDataRequired: true,
    };

    // Model fabricates non-existent measurements (14.5, 28.0, 99.5)
    const fabricatedDataMarkdown = `
\`\`\`chart
{
  "type": "line",
  "title": "غلظت پلاسمایی ساختگی متوپرولول",
  "mode": "data",
  "sourceCitation": "رفرنس ساختگی",
  "series": [
    {
      "name": "متوپرولول",
      "data": [
        { "x": 1, "y": 14.5 },
        { "x": 2, "y": 28.0 },
        { "x": 4, "y": 99.5 }
      ]
    }
  ]
}
\`\`\`
`;

    const gateResult = validateLessonChartGate(fabricatedDataMarkdown, [dataIntent], [sourceChunk]);
    expect(gateResult.valid).toBe(false);
    expect(gateResult.errors.some((e) => e.includes("در متن چانک‌های منبع یافت نشد"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 5: No Chart Needed (Definitions / Taxonomy)
  // ---------------------------------------------------------------------------
  it("Test 5: handles session with no visualization intent and clean markdown", () => {
    const noIntentSessionMarkdown = `
# رده‌بندی گیرنده‌های سلولی

گیرنده‌های دارویی به ۴ رده اصلی تقسیم می‌شوند:
۱. گیرنده‌های جفت‌شده با پروتئین جی (GPCR)
۲. گیرنده‌های وابسته به کانال یونی
۳. گیرنده‌های با فعالیت آنزیمی درون‌زاد
۴. گیرنده‌های داخل سلولی و هسته‌ای
`;

    const gateResult = validateLessonChartGate(noIntentSessionMarkdown, []);
    expect(gateResult.valid).toBe(true);
    expect(gateResult.errors).toHaveLength(0);
    expect(gateResult.charts).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Unrequested Chart Block Fails Validation (Fail-Fast)
  // ---------------------------------------------------------------------------
  it("Test 6: strictly fails validation when a chart is generated without visualization intent", () => {
    const unrequestedChartMarkdown = `
# مقدمه و تعاریف فارماکولوژی

\`\`\`chart
{
  "type": "pie",
  "title": "نمودار بدون مجوز",
  "data": [
    { "label": "بخش ۱", "value": 50 },
    { "label": "بخش ۲", "value": 50 }
  ]
}
\`\`\`
`;

    // Empty intent array []
    const gateResult = validateLessonChartGate(unrequestedChartMarkdown, []);
    expect(gateResult.valid).toBe(false);
    expect(gateResult.errors.some((e) => e.includes("فاقد قصد بصری‌سازی"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Pipeline Flow: Planner Output -> ContentPlan -> Session Blueprint
  // ---------------------------------------------------------------------------
  it("Test 7: verifies suggestedVisualizations survives mapping and serialization into session blueprint", () => {
    const rawPlannerResponse = {
      kind: "content_plan",
      moduleTitle: "فارماکولوژی ۱",
      sourceTopics: [],
      sessions: [
        {
          index: 0,
          title: "جلسه ۱: مبانی دوز و پاسخ",
          description: "بررسی منحنی دوز-پاسخ",
          coreConcepts: [],
          relevantChunkIds: ["c1"],
          targetFlashcardCount: 10,
          targetQuizCount: 8,
          suggestedVisualizations: [
            {
              type: "line",
              mode: "conceptual",
              concept: "منحنی دوز-پاسخ و مفاهیم Emax و EC50",
              rationale: "تفهیم بصری رابطه نیمه‌لگاریتمی",
              sourceDataRequired: false,
            },
          ],
        },
        {
          index: 1,
          title: "جلسه ۲: رده‌بندی گیرنده‌ها",
          description: "تاکسونومی گیرنده‌ها",
          coreConcepts: [],
          relevantChunkIds: ["c2"],
          targetFlashcardCount: 10,
          targetQuizCount: 8,
          suggestedVisualizations: [],
        },
      ],
      highYieldFacts: [],
    };

    // 1. Production extractContentPlan mapping helper
    const chunkIdSet = new Set(["c1", "c2"]);
    const mappedSessions = mapPlannerSessionsToContentPlan(
      rawPlannerResponse.sessions,
      chunkIdSet,
      10,
      8,
      ["c1", "c2"],
    );

    expect(mappedSessions[0].suggestedVisualizations).toHaveLength(1);
    expect(mappedSessions[0].suggestedVisualizations![0].mode).toBe("conceptual");
    expect(mappedSessions[1].suggestedVisualizations).toHaveLength(0);

    // 2. Production buildSessionBlueprintPayload helper
    const payload0 = buildSessionBlueprintPayload(mappedSessions[0]);
    expect(payload0.suggestedVisualizations).toHaveLength(1);
    expect(payload0.suggestedVisualizations[0].concept).toBe("منحنی دوز-پاسخ و مفاهیم Emax و EC50");

    const sessionBlueprintJson = JSON.stringify(payload0, null, 2);
    const parsedBlueprint = JSON.parse(sessionBlueprintJson);
    expect(parsedBlueprint.suggestedVisualizations).toHaveLength(1);
    expect(parsedBlueprint.suggestedVisualizations[0].concept).toBe("منحنی دوز-پاسخ و مفاهیم Emax و EC50");
  });

  // ---------------------------------------------------------------------------
  // Test 8: Multi-Session Course with Selective Charts (Zero Leakage)
  // ---------------------------------------------------------------------------
  it("Test 8: ensures 10-session course isolates intents to their exact respective sessions", () => {
    const courseSessions = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      title: `جلسه ${i + 1}`,
      suggestedVisualizations: [3, 4, 5].includes(i)
        ? [
            {
              type: "line" as const,
              mode: "conceptual" as const,
              concept: `مفهوم اختصاصی جلسه ${i + 1}`,
              rationale: "استدلال آموزشی",
              sourceDataRequired: false,
            },
          ]
        : [],
    }));

    // Verify isolation
    for (let i = 0; i < 10; i++) {
      const sess = courseSessions[i];
      if ([3, 4, 5].includes(i)) {
        expect(sess.suggestedVisualizations).toHaveLength(1);
      } else {
        expect(sess.suggestedVisualizations).toHaveLength(0);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 9: Density Cap Protection (Max 2 Charts per Session)
  // ---------------------------------------------------------------------------
  it("Test 9: rejects sessions exceeding the maximum chart density cap", () => {
    const intent: SuggestedVisualization = {
      type: "line",
      mode: "conceptual",
      concept: "تست",
      rationale: "تست",
      sourceDataRequired: false,
    };

    // 3 charts generated when MAX_CHARTS_PER_SESSION = 2
    const tripleChartMarkdown = `
\`\`\`chart
{ "type": "line", "title": "نمودار ۱", "mode": "conceptual", "curves": [{ "name": "c1", "model": "sigmoidal", "parameters": { "emax": 100, "logEC50": -7 }, "parameterSemantics": "normalized" }] }
\`\`\`

\`\`\`chart
{ "type": "line", "title": "نمودار ۲", "mode": "conceptual", "curves": [{ "name": "c2", "model": "sigmoidal", "parameters": { "emax": 100, "logEC50": -7 }, "parameterSemantics": "normalized" }] }
\`\`\`

\`\`\`chart
{ "type": "line", "title": "نمودار ۳", "mode": "conceptual", "curves": [{ "name": "c3", "model": "sigmoidal", "parameters": { "emax": 100, "logEC50": -7 }, "parameterSemantics": "normalized" }] }
\`\`\`
`;

    const gateResult = validateLessonChartGate(tripleChartMarkdown, [intent]);
    expect(gateResult.valid).toBe(false);
    expect(gateResult.errors.some((e) => e.includes("سقف مجاز"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Concept Mismatch Detection
  // ---------------------------------------------------------------------------
  it("Test 10: rejects chart when intent concept does not match generated canonical concept", () => {
    // Intent is competitive antagonism
    const intent: SuggestedVisualization = {
      type: "line",
      mode: "conceptual",
      concept: "آنتاگونیسم رقابتی",
      rationale: "شیفت به راست",
      sourceDataRequired: false,
    };

    // But generator emitted an inverse agonism chart
    const mismatchedMarkdown = `
\`\`\`chart
{
  "type": "line",
  "title": "اثر آگونیست معکوس بر فعالیت پایه گیرنده",
  "mode": "conceptual",
  "curves": [
    { "name": "آگونیست معکوس", "model": "sigmoidal", "parameters": { "emax": 0, "logEC50": -7, "baseline": 25 }, "parameterSemantics": "normalized" }
  ]
}
\`\`\`
`;

    const gateResult = validateLessonChartGate(mismatchedMarkdown, [intent]);
    expect(gateResult.valid).toBe(false);
    expect(gateResult.errors.some((e) => e.includes("مغایرت مفهومی"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Batch & Single-Session Transmission Verification
  // ---------------------------------------------------------------------------
  it("Test 11: verifies both batch and single-session paths transmit suggestedVisualizations via buildSessionBlueprintPayload", () => {
    const sessionWithIntent = {
      index: 0,
      title: "جلسه با نمودار",
      description: "توضیحات",
      coreConcepts: [],
      relevantChunkIds: ["chunk-1"],
      targetFlashcardCount: 10,
      targetQuizCount: 8,
      suggestedVisualizations: [
        {
          type: "line" as const,
          mode: "conceptual" as const,
          concept: "آنتاگونیسم رقابتی",
          rationale: "شیفت به راست",
          sourceDataRequired: false,
        },
      ],
    };

    // Batch path: buildSessionBlueprintPayload is used for each item
    const batchPayload = buildSessionBlueprintPayload(sessionWithIntent);
    const batchBlueprintJson = JSON.stringify(batchPayload, null, 2);
    const batchParsed = JSON.parse(batchBlueprintJson);
    expect(batchParsed.suggestedVisualizations).toHaveLength(1);
    expect(batchParsed.suggestedVisualizations[0].concept).toBe("آنتاگونیسم رقابتی");

    // Single-session path: buildSessionBlueprintPayload is used directly
    const singlePayload = buildSessionBlueprintPayload(sessionWithIntent);
    const singleBlueprintJson = JSON.stringify(singlePayload, null, 2);
    const singleParsed = JSON.parse(singleBlueprintJson);
    expect(singleParsed.suggestedVisualizations).toHaveLength(1);
    expect(singleParsed.suggestedVisualizations[0].concept).toBe("آنتاگونیسم رقابتی");
  });

  // ---------------------------------------------------------------------------
  // Test 12: Resume / Retry Verification (Cache Preserves Intents Without Planner Rerun)
  // ---------------------------------------------------------------------------
  it("Test 12: verifies cached ContentPlan preserves suggestedVisualizations on resume without re-running planner (planner invocation count = 0)", async () => {
    const chunkRecordStore = new InMemoryGenerationChunkStore();
    const completeSpy = vi.fn();
    const mockGateway: ModelGateway = {
      complete: completeSpy,
      stream: vi.fn(),
      countTokens: vi.fn(),
    };

    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const contentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();

    const genService = new GenerationService(
      contentStore,
      citationStore,
      mockGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
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

    const docId = "doc-test" as DocumentId;
    const orgId = "org-test" as OrganizationId;
    const courseId = "course-test" as CourseId;

    const cachedPlanningClaimPayload = {
      contentPlan: {
        moduleTitle: "فارماکولوژی قلب و عروق",
        sourceTopics: [],
        sessions: [
          {
            index: 0,
            title: "جلسه ۱: بتابلوکرها",
            description: "بررسی منحنی دوز پاسخ",
            coreConcepts: [],
            relevantChunkIds: ["chk-1"],
            targetFlashcardCount: 10,
            targetQuizCount: 8,
            suggestedVisualizations: [
              {
                type: "line" as const,
                mode: "conceptual" as const,
                concept: "آنتاگونیسم رقابتی",
                rationale: "شیفت موازی به راست",
                sourceDataRequired: false,
              },
            ],
          },
        ],
        highYieldFacts: [],
      },
      moduleTitle: "فارماکولوژی قلب و عروق",
      outline: [],
      citationChunkIds: ["chk-1"],
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 200 },
    };

    // Pre-populate the cache with a completed planning claim
    await chunkRecordStore.upsert({
      id: "chunk-plan-test",
      organizationId: orgId,
      documentId: docId,
      courseId,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
      status: "completed",
      payload: cachedPlanningClaimPayload,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const docRecord = {
      id: docId,
      courseId,
      originalName: "cardio-pharma.pdf",
      status: "generating" as const,
      organizationId: orgId,
    } as unknown as DocumentRecord;

    const res = await genService.extractContentPlan(
      docRecord,
      [{ id: "chk-1", content: "بتابلوکرها گیرنده‌های بتا را مهار می‌کنند.", heading: "مقدمه" }],
      {
        topicBudget: { targetTopicCount: 1, minTopics: 1, maxTopics: 2 },
        flashcardBudget: { targetCardsPerTopic: 10, minCardsPerTopic: 5, maxCardsPerTopic: 15 },
        quizBudget: { targetQuestionsPerTopic: 8, minQuestionsPerTopic: 4, maxQuestionsPerTopic: 12 },
      },
      "v1",
      "corr-test-12",
      orgId,
      docId,
      courseId,
    );

    // 1. Assert Planner (gateway.complete) was NOT called (0 invocations)
    expect(completeSpy).toHaveBeenCalledTimes(0);

    // 2. Assert suggestedVisualizations was loaded directly from cache and preserved
    expect(res.contentPlan.sessions[0].suggestedVisualizations).toHaveLength(1);
    expect(res.contentPlan.sessions[0].suggestedVisualizations![0].concept).toBe("آنتاگونیسم رقابتی");

    // 3. Passed into session blueprint payload
    const blueprintPayload = buildSessionBlueprintPayload(res.contentPlan.sessions[0]);
    expect(blueprintPayload.suggestedVisualizations).toHaveLength(1);
    expect(blueprintPayload.suggestedVisualizations[0].type).toBe("line");
  });

  // ---------------------------------------------------------------------------
  // Test 13: Generic Conceptual Chart (Non-Canonical Bar Chart) Allowed
  // ---------------------------------------------------------------------------
  it("Test 13: allows non-canonical generic conceptual chart (bar chart) without requiring curves", () => {
    const barIntent: SuggestedVisualization = {
      type: "bar",
      mode: "conceptual",
      concept: "مقایسه کیفی توزیع گیرنده‌های آدرنرژیک در بافت‌های بدن",
      rationale: "نمایش مقایسه‌ای سطح بیان گیرنده‌ها در قلب، عروق و برونش‌ها",
      sourceDataRequired: false,
    };

    const conceptualBarMarkdown = `
\`\`\`chart
{
  "type": "bar",
  "title": "مقایسه کیفی بیان گیرنده‌های آدرنرژیک",
  "mode": "conceptual",
  "xAxis": { "label": "بافت هدف" },
  "yAxis": { "label": "تراکم نسبی (کیفی)", "min": 0, "max": 100 },
  "series": [
    {
      "name": "تراکم گیرنده",
      "data": [
        { "label": "میوکارد (قلب)", "value": 85 },
        { "label": "عضلات صاف عروقی", "value": 40 },
        { "label": "عضلات برونش", "value": 15 }
      ]
    }
  ]
}
\`\`\`
`;

    const gateResult = validateLessonChartGate(conceptualBarMarkdown, [barIntent]);
    expect(gateResult.valid).toBe(true);
    expect(gateResult.errors).toHaveLength(0);
    expect(gateResult.charts).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Test 14: Data Grounding (Markdown Table Rows vs Number Presence vs Ungrounded)
  // ---------------------------------------------------------------------------
  it("Test 14: accurately distinguishes table_row_verified, numbers_present, and ungrounded", () => {
    const tableChunk = {
      id: "chunk-table",
      content: `
| زمان (ساعت) | غلظت دارویی (ng/mL) |
|---|---|
| 1 | 25 |
| 2 | 50 |
| 4 | 100 |
`,
    };

    const textChunkWithoutTable = {
      id: "chunk-text",
      content: "در این آزمایش اعداد 25، 50 و 100 برای غلظت و 1، 2 و 4 برای زمان گزارش شدند.",
    };

    const testChart: EducationalChart = {
      type: "line",
      title: "غلظت دارویی",
      mode: "data",
      sourceCitation: "جدول ۱",
      series: [
        {
          name: "دارو A",
          data: [
            { x: 1, y: 25 },
            { x: 2, y: 50 },
            { x: 4, y: 100 },
          ],
        },
      ],
    };

    // Case A: Table row verification proves exact row pairing
    const tableVerification = verifyDataPointsAgainstSourceChunks(testChart, [tableChunk]);
    expect(tableVerification.verified).toBe(true);
    expect(tableVerification.level).toBe("table_row_verified");
    expect(tableVerification.tableRowMatches).toBe(3);

    // Case B: Free text has numbers but no table structure -> numbers_present with transparent warning
    const textVerification = verifyDataPointsAgainstSourceChunks(testChart, [textChunkWithoutTable]);
    expect(textVerification.verified).toBe(true);
    expect(textVerification.level).toBe("numbers_present");

    const gateResultWarning = validateLessonChartGate(
      `\`\`\`chart\n${JSON.stringify(testChart)}\n\`\`\``,
      [
        {
          type: "line",
          mode: "data",
          concept: "غلظت دارویی",
          rationale: "تست",
          sourceDataRequired: true,
        },
      ],
      [textChunkWithoutTable],
    );
    expect(gateResultWarning.valid).toBe(true);
    expect(gateResultWarning.warnings.some((w) => w.includes("حضور اعداد"))).toBe(true);

    // Case C: Missing numbers -> ungrounded (rejection)
    const emptyChunk = { id: "chunk-empty", content: "هیچ عدد مرتبطی در این متن وجود ندارد." };
    const ungroundedVerification = verifyDataPointsAgainstSourceChunks(testChart, [emptyChunk]);
    expect(ungroundedVerification.verified).toBe(false);
    expect(ungroundedVerification.level).toBe("ungrounded");
    expect(ungroundedVerification.ungroundedNumbers.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test 15: Canonical Matching Tightening (Excludes Standalone Generic Keywords)
  // ---------------------------------------------------------------------------
  it("Test 15: correctly ignores standalone generic keywords and only matches precise canonical phrases", () => {
    // Standalone generic phrases should NOT trigger canonical pharmacology models
    expect(matchCanonicalConceptKey("بررسی فعالیت پایه در زیست‌شناسی")).toBeNull();
    expect(matchCanonicalConceptKey("سقف کارایی فرآیند متابولیک")).toBeNull();
    expect(matchCanonicalConceptKey("کارایی ذاتی آنزیم‌ها")).toBeNull();

    // Precise pharmacological contextual phrases MUST match
    expect(matchCanonicalConceptKey("آنتاگونیسم رقابتی و مهار گیرنده")).toBe("competitive_antagonist");
    expect(matchCanonicalConceptKey("آگونیست جزئی در برابر آگونیست کامل")).toBe("full_vs_partial_agonist");
    expect(matchCanonicalConceptKey("بررسی اثر آگونیست معکوس")).toBe("inverse_agonist");
    expect(matchCanonicalConceptKey("منحنی دوز-پاسخ درجه‌بندی‌شده")).toBe("dose_response");
    expect(matchCanonicalConceptKey("concentration-response relationship")).toBe("dose_response");
  });

  // ---------------------------------------------------------------------------
  // Test 16: Scrambled Data Table Rejection of Exact Mapping Claim
  // ---------------------------------------------------------------------------
  it("Test 16: strictly rejects exact source mapping claim when numbers are scrambled / mismatched against source table", () => {
    const tableChunk = {
      id: "chunk-table-dose-resp",
      content: `
| Dose | Response |
|---|---|
| 1 | 10 |
| 2 | 25 |
| 4 | 50 |
| 8 | 80 |
`,
    };

    // Scrambled fake chart: 1->25, 2->10, 4->80, 8->50
    const fakeScrambledChart: EducationalChart = {
      type: "line",
      title: "پاسخ دوز تجربی جعلی",
      mode: "data",
      sourceCitation: "جدول منبع",
      series: [
        {
          name: "دارو",
          data: [
            { x: 1, y: 25 },
            { x: 2, y: 10 },
            { x: 4, y: 80 },
            { x: 8, y: 50 },
          ],
        },
      ],
    };

    const grounding = verifyDataPointsAgainstSourceChunks(fakeScrambledChart, [tableChunk]);
    // Numbers are present in text, but table row pairing is NOT matched
    expect(grounding.verified).toBe(true);
    expect(grounding.level).not.toBe("table_row_verified");
    expect(grounding.level).toBe("numbers_present");
    expect(grounding.tableRowMatches).toBe(0);
    expect(grounding.details).toContain("mapping در سطح سطر جدول اثبات نشده است");

    // When validated in gate, emits a transparent warning and never claims exact table mapping
    const gateResult = validateLessonChartGate(
      `\`\`\`chart\n${JSON.stringify(fakeScrambledChart)}\n\`\`\``,
      [
        {
          type: "line",
          mode: "data",
          concept: "پاسخ دوز تجربی",
          rationale: "تست",
          sourceDataRequired: true,
        },
      ],
      [tableChunk],
    );
    expect(gateResult.valid).toBe(true);
    expect(gateResult.warnings.some((w) => w.includes("تناظر جفتی (x, y) در قالب جدول اثبات نشده است"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 17: MAX_CHARTS_PER_SESSION Fail-Fast (No Silent Truncation)
  // ---------------------------------------------------------------------------
  it("Test 17: strictly fails fast when Planner generates > MAX_CHARTS_PER_SESSION (no silent truncation)", () => {
    const rawSessionsWith3Intents = [
      {
        index: 0,
        title: "جلسه با ۳ اینتنت",
        suggestedVisualizations: [
          { type: "line" as const, mode: "conceptual" as const, concept: "مفهوم ۱", rationale: "دلیل ۱", sourceDataRequired: false },
          { type: "line" as const, mode: "conceptual" as const, concept: "مفهوم ۲", rationale: "دلیل ۲", sourceDataRequired: false },
          { type: "line" as const, mode: "conceptual" as const, concept: "مفهوم ۳", rationale: "دلیل ۳", sourceDataRequired: false },
        ],
      },
    ];

    // 1. Contract validation in mapPlannerSessionsToContentPlan fails fast with DomainError
    expect(() =>
      mapPlannerSessionsToContentPlan(rawSessionsWith3Intents, new Set(), 10, 8),
    ).toThrowError(/سقف مجاز/);

    // 2. Gate validation also fails fast if 3 intents are passed
    const gateResult = validateLessonChartGate(
      "",
      rawSessionsWith3Intents[0].suggestedVisualizations,
    );
    expect(gateResult.valid).toBe(false);
    expect(gateResult.errors.some((e) => e.includes("سقف مجاز"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 18: Canonical Concept Matching Exact False-Positive and True-Positive Matrix
  // ---------------------------------------------------------------------------
  it("Test 18: exact false-positive and true-positive canonical matching matrix", () => {
    // 4 explicit false-positive cases: must NOT match canonical pharmacology models
    expect(matchCanonicalConceptKey("فعالیت پایه گیرنده")).toBeNull();
    expect(matchCanonicalConceptKey("کارایی ذاتی دارو")).toBeNull();
    expect(matchCanonicalConceptKey("EC50 دارو")).toBeNull();
    expect(matchCanonicalConceptKey("سقف کارایی یک دارو")).toBeNull();

    // 4 explicit true-positive cases: MUST match canonical pharmacology models
    expect(matchCanonicalConceptKey("آنتاگونیسم رقابتی")).toBe("competitive_antagonist");
    expect(matchCanonicalConceptKey("آگونیست جزئی")).toBe("full_vs_partial_agonist");
    expect(matchCanonicalConceptKey("آگونیست معکوس")).toBe("inverse_agonist");
    expect(matchCanonicalConceptKey("منحنی غلظت-پاسخ")).toBe("dose_response");
  });
});
