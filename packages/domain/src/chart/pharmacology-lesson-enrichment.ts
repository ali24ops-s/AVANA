import { EducationalChart } from "./types.js";

/**
 * Target lesson and course identifiers for AVANA Pharmacology 1
 */
export const TARGET_PHARMACOLOGY_LESSON = {
  courseName: "فارماکولوژی ۱",
  courseId: "eaeb267d-26b8-4894-8cb8-d8e704c1a648",
  documentId: "4609c8f2-290e-4eff-a35c-51ef2e439738",
  generatedContentId: "d5b1f4b8-cd22-49b1-8277-db0d0f7cfbd6",
  title: "اصول عمومی فارماکولوژی و برهم‌کنش‌های دارو-گیرنده",
} as const;

/**
 * Canonical educational conceptual chart specifications for the 4 key pharmacology topics.
 *
 * Rules:
 * - mode: "conceptual"
 * - parameterSemantics: "normalized"
 * - No fake empirical citations or fictitious drug numbers
 * - Explicit schematic representations using valid sigmoidal models
 */
export const PHARMACOLOGY_CANONICAL_CHARTS = {
  // Chart 1: Session 4 - Concentration-Effect Curve & Emax / EC50
  doseResponse: {
    type: "line",
    title: "منحنی غلظت-پاسخ و مفاهیم Emax و EC50",
    mode: "conceptual",
    xAxis: {
      label: "غلظت آگونیست (M)",
      unit: "M",
      scale: "log",
      min: 1e-10,
      max: 1e-4,
    },
    yAxis: {
      label: "پاسخ زیستی",
      unit: "%",
      min: 0,
      max: 100,
    },
    curves: [
      {
        name: "آگونیست کامل",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -7,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
      },
    ],
  } as EducationalChart,

  // Chart 2: Session 5 - Reversible Competitive Antagonism Parallel Rightward Shift
  competitiveAntagonist: {
    type: "line",
    title: "آنتاگونیسم رقابتی برگشت‌پذیر و شیفت موازی به راست",
    mode: "conceptual",
    xAxis: {
      label: "غلظت آگونیست (M)",
      unit: "M",
      scale: "log",
      min: 1e-10,
      max: 1e-3,
    },
    yAxis: {
      label: "پاسخ زیستی",
      unit: "%",
      min: 0,
      max: 100,
    },
    curves: [
      {
        name: "آگونیست به تنهایی",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -8,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
      },
      {
        name: "آگونیست + آنتاگونیست رقابتی (دوز کم)",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -7,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
        lineStyle: "dashed",
      },
      {
        name: "آگونیست + آنتاگونیست رقابتی (دوز زیاد)",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -6,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
        lineStyle: "dashed",
      },
    ],
  } as EducationalChart,

  // Chart 3: Session 6 - Full vs Partial Agonist Efficacy Ceiling
  fullVsPartialAgonist: {
    type: "line",
    title: "مقایسه آگونیست کامل و آگونیست جزئی",
    mode: "conceptual",
    xAxis: {
      label: "غلظت آگونیست (M)",
      unit: "M",
      scale: "log",
      min: 1e-10,
      max: 1e-4,
    },
    yAxis: {
      label: "پاسخ زیستی",
      unit: "%",
      min: 0,
      max: 100,
    },
    curves: [
      {
        name: "آگونیست کامل (Emax = 100%)",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -7,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
      },
      {
        name: "آگونیست جزئی (Emax = 45%)",
        model: "sigmoidal",
        parameters: {
          emax: 45,
          logEC50: -7,
          hillSlope: 1,
          baseline: 0,
        },
        parameterSemantics: "normalized",
        lineStyle: "dashed",
      },
    ],
  } as EducationalChart,

  // Chart 4: Session 7 - Inverse Agonist Suppression below Basal Constitutive Activity
  inverseAgonist: {
    type: "line",
    title: "اثر آگونیست کامل، آنتاگونیست خنثی و آگونیست معکوس بر فعالیت گیرنده",
    mode: "conceptual",
    xAxis: {
      label: "غلظت لیگاند (M)",
      unit: "M",
      scale: "log",
      min: 1e-10,
      max: 1e-4,
    },
    yAxis: {
      label: "فعالیت گیرنده",
      unit: "%",
      min: 0,
      max: 100,
    },
    curves: [
      {
        name: "آگونیست کامل (Emax = 100%)",
        model: "sigmoidal",
        parameters: {
          emax: 100,
          logEC50: -7,
          hillSlope: 1,
          baseline: 25,
        },
        parameterSemantics: "normalized",
      },
      {
        name: "آنتاگونیست خنثی (حفظ فعالیت پایه ۲۵٪)",
        model: "sigmoidal",
        parameters: {
          emax: 25,
          logEC50: -7,
          hillSlope: 1,
          baseline: 25,
        },
        parameterSemantics: "normalized",
        lineStyle: "dashed",
      },
      {
        name: "آگونیست معکوس (کاهش فعالیت به زیر پایه)",
        model: "sigmoidal",
        parameters: {
          emax: 0,
          logEC50: -7,
          hillSlope: 1,
          baseline: 25,
        },
        parameterSemantics: "normalized",
      },
    ],
  } as EducationalChart,
};

/**
 * Exact anchor definitions for target insertion points in sessions 4, 5, 6, and 7.
 */
export interface SessionEnrichmentAnchor {
  sessionIndex: number; // 0-indexed: 3 = Session 4, 4 = Session 5, etc.
  sessionTitle: string;
  beforeAnchor: string;
  afterAnchor: string;
  chart: EducationalChart;
}

export const PHARMACOLOGY_SESSION_ANCHORS: SessionEnrichmentAnchor[] = [
  {
    sessionIndex: 3,
    sessionTitle: "جلسه ۴: منحنی‌های غلظت-پاسخ و مفهوم گیرنده‌های یدکی",
    beforeAnchor:
      "این پارامترها به همراه شیب بخش خطی منحنی، ابزارهای قدرتمندی برای مقایسه داروهای مختلفی هستند که اثرات کیفی مشابهی ایجاد می‌کنند.",
    afterAnchor: "> **اشتباه رایج:**",
    chart: PHARMACOLOGY_CANONICAL_CHARTS.doseResponse,
  },
  {
    sessionIndex: 4,
    sessionTitle: "جلسه ۵: آنتاگونیسم رقابتی (برگشت‌پذیر و برگشت‌ناپذیر)",
    beforeAnchor:
      "این ویژگی‌ها، **نشانگر کلاسیک (Hallmark)** آنتاگونیسم رقابتی برگشت‌پذیر هستند.",
    afterAnchor: "### نسبت دوز (Dose Ratio) و پلات شیلد (Schild Plot)",
    chart: PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist,
  },
  {
    sessionIndex: 5,
    sessionTitle: "جلسه ۶: کارایی (Efficacy) و آگونیست‌های جزئی",
    beforeAnchor:
      "> تصور نکنید که اشغال کامل گیرنده توسط یک آگونیست جزئی به معنای ایجاد پاسخ حداکثری است. تفاوت اصلی آگونیست‌های کامل و جزئی در رابطه بین اشغال گیرنده و پاسخ بافتی است؛ آگونیست جزئی حتی در اشغال کامل گیرنده‌ها نیز نمی‌تواند پاسخ ماکزیمم بافت را بروز دهد.",
    afterAnchor: "### قطعی نبودن کارایی به عنوان یک ویژگی مطلق بافتی",
    chart: PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist,
  },
  {
    sessionIndex: 6,
    sessionTitle: "جلسه ۷: فعالیت ذاتی و آگونیست‌های معکوس",
    beforeAnchor:
      "> آگونیست معکوس را با آنتاگونیست خنثی (Neutral Antagonist) اشتباه نگیرید. تفاوت اصلی این است که آنتاگونیست خنثی هیچ تأثیری بر سطح فعالیت پایه گیرنده ندارد زیرا میل ترکیبی‌اش برای هر دو حالت $R$ و $R^*$ برابر است؛ در حالی که آگونیست معکوس با تثبیت حالت استراحت ($R$)، سطح فعالیت پایه گیرنده را کاهش می‌دهد.",
    afterAnchor: "### اهمیت بالینی و مثال‌ها",
    chart: PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist,
  },
];

/**
 * Formats an EducationalChart object into a markdown code block fence.
 */
export function formatChartCodeFence(chart: EducationalChart): string {
  return `\`\`\`chart\n${JSON.stringify(chart, null, 2)}\n\`\`\``;
}

/**
 * Strips educational chart code blocks from markdown to verify byte-for-byte content preservation.
 * Matches `\n\n```chart\n...\n```\n\n` and collapses it back to the original `\n\n`.
 */
export function stripEducationalChartBlocks(markdown: string): string {
  return markdown.replace(/\n\n```chart\n[\s\S]*?\n```(?=\n\n)/g, "");
}

/**
 * Enriches a single session's markdown with its target chart, if applicable.
 * Guarantee: Idempotent and preserves 100% of surrounding content.
 */
export function enrichSessionMarkdown(
  sessionIndex: number,
  originalMarkdown: string,
): { enrichedMarkdown: string; inserted: boolean } {
  const anchor = PHARMACOLOGY_SESSION_ANCHORS.find(
    (a) => a.sessionIndex === sessionIndex,
  );

  if (!anchor) {
    return { enrichedMarkdown: originalMarkdown, inserted: false };
  }

  // Idempotency: If this chart title is already present, do not insert again
  if (originalMarkdown.includes(`"title": "${anchor.chart.title}"`)) {
    return { enrichedMarkdown: originalMarkdown, inserted: false };
  }

  const beforePos = originalMarkdown.indexOf(anchor.beforeAnchor);
  if (beforePos === -1) {
    throw new Error(
      `Before anchor not found in session ${sessionIndex + 1} (${anchor.sessionTitle}): "${anchor.beforeAnchor}"`,
    );
  }

  const afterPos = originalMarkdown.indexOf(anchor.afterAnchor, beforePos);
  if (afterPos === -1) {
    throw new Error(
      `After anchor not found in session ${sessionIndex + 1} (${anchor.sessionTitle}): "${anchor.afterAnchor}"`,
    );
  }

  // The text between beforeAnchor and afterAnchor must be standard newlines
  const between = originalMarkdown.slice(beforePos + anchor.beforeAnchor.length, afterPos);
  if (!between.includes("\n\n")) {
    throw new Error(
      `Unexpected content between anchors in session ${sessionIndex + 1}: ${JSON.stringify(between)}`,
    );
  }

  const insertPos = beforePos + anchor.beforeAnchor.length + "\n\n".length;
  const chartFence = `${formatChartCodeFence(anchor.chart)}\n\n`;

  const enriched =
    originalMarkdown.slice(0, insertPos) +
    chartFence +
    originalMarkdown.slice(insertPos);

  // Immediate preservation verification
  const stripped = stripEducationalChartBlocks(enriched);
  if (stripped !== originalMarkdown) {
    throw new Error(
      `Content preservation invariant violated for session ${sessionIndex + 1}! Original length: ${originalMarkdown.length}, stripped length: ${stripped.length}`,
    );
  }

  return { enrichedMarkdown: enriched, inserted: true };
}

/**
 * Simple line diff verification to ensure only additions occur.
 */
export interface RawDiffResult {
  hasModificationsOrDeletions: boolean;
  addedLinesCount: number;
  removedLinesCount: number;
  diffLines: string[];
}

export function generateStrictDiff(
  originalText: string,
  enrichedText: string,
): RawDiffResult {
  const origLines = originalText.split("\n");
  const enrichedLines = enrichedText.split("\n");

  const diffLines: string[] = [];
  let origIdx = 0;
  let addedLinesCount = 0;
  let removedLinesCount = 0;

  for (let enrIdx = 0; enrIdx < enrichedLines.length; enrIdx++) {
    const enrLine = enrichedLines[enrIdx];
    if (origIdx < origLines.length && origLines[origIdx] === enrLine) {
      origIdx++;
    } else {
      // Line was added
      diffLines.push(`+ ${enrLine}`);
      addedLinesCount++;
    }
  }

  if (origIdx !== origLines.length) {
    removedLinesCount = origLines.length - origIdx;
    for (let i = origIdx; i < origLines.length; i++) {
      diffLines.push(`- ${origLines[i]}`);
    }
  }

  return {
    hasModificationsOrDeletions: removedLinesCount > 0,
    addedLinesCount,
    removedLinesCount,
    diffLines,
  };
}

/**
 * Enriches the entire lesson payload (both sessions array and consolidated contentMarkdown).
 */
export interface EnrichedPayloadResult {
  enrichedPayload: Record<string, unknown>;
  totalInsertedCharts: number;
  sessionResults: Array<{
    sessionIndex: number;
    title: string;
    inserted: boolean;
  }>;
  diffSummary: {
    consolidatedDiff: RawDiffResult;
    sessionDiffs: RawDiffResult[];
  };
}

export function enrichPharmacologyLessonPayload(
  payload: Record<string, unknown>,
): EnrichedPayloadResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be a non-null object");
  }

  const sessions = payload.sessions as
    | Array<{ title: string; contentMarkdown: string; [key: string]: unknown }>
    | undefined;

  if (!Array.isArray(sessions) || sessions.length !== 10) {
    throw new Error(
      `Expected exactly 10 sessions in pharmacology lesson payload, found: ${sessions?.length ?? 0}`,
    );
  }

  let totalInsertedCharts = 0;
  const sessionResults: Array<{
    sessionIndex: number;
    title: string;
    inserted: boolean;
  }> = [];
  const sessionDiffs: RawDiffResult[] = [];

  const enrichedSessions = sessions.map((sess, idx) => {
    const originalMd = sess.contentMarkdown || "";
    const { enrichedMarkdown, inserted } = enrichSessionMarkdown(idx, originalMd);

    if (inserted) {
      totalInsertedCharts++;
    }

    const diff = generateStrictDiff(originalMd, enrichedMarkdown);
    if (diff.hasModificationsOrDeletions) {
      throw new Error(
        `Strict diff check failed for session ${idx + 1}: modifications/deletions detected!`,
      );
    }

    sessionResults.push({
      sessionIndex: idx,
      title: sess.title,
      inserted,
    });
    sessionDiffs.push(diff);

    return {
      ...sess,
      contentMarkdown: enrichedMarkdown,
    };
  });

  // Now enrich the consolidated contentMarkdown:
  // Since the consolidated markdown contains the TOC + the sessions in order,
  // we apply each of the 4 anchor insertions to the consolidated markdown as well.
  const originalConsolidatedMd = (payload.contentMarkdown as string) || "";
  let enrichedConsolidatedMd = originalConsolidatedMd;

  // Verify consolidated markdown semantic preservation if any charts were inserted
  let consolidatedInserted = false;
  for (const anchor of PHARMACOLOGY_SESSION_ANCHORS) {
    if (enrichedConsolidatedMd.includes(`"title": "${anchor.chart.title}"`)) {
      continue;
    }

    const beforePos = enrichedConsolidatedMd.indexOf(anchor.beforeAnchor);
    if (beforePos === -1) {
      throw new Error(
        `Anchor before not found in consolidated markdown: "${anchor.beforeAnchor}"`,
      );
    }

    const afterPos = enrichedConsolidatedMd.indexOf(anchor.afterAnchor, beforePos);
    if (afterPos === -1) {
      throw new Error(
        `Anchor after not found in consolidated markdown: "${anchor.afterAnchor}"`,
      );
    }

    const insertPos = beforePos + anchor.beforeAnchor.length + "\n\n".length;
    const chartFence = `${formatChartCodeFence(anchor.chart)}\n\n`;

    enrichedConsolidatedMd =
      enrichedConsolidatedMd.slice(0, insertPos) +
      chartFence +
      enrichedConsolidatedMd.slice(insertPos);
    consolidatedInserted = true;
  }

  if (consolidatedInserted) {
    const strippedConsolidated = stripEducationalChartBlocks(enrichedConsolidatedMd);
    if (strippedConsolidated !== originalConsolidatedMd) {
      throw new Error(
        `Content preservation invariant violated for consolidated contentMarkdown! Original length: ${originalConsolidatedMd.length}, stripped length: ${strippedConsolidated.length}`,
      );
    }
  }

  const consolidatedDiff = generateStrictDiff(
    originalConsolidatedMd,
    enrichedConsolidatedMd,
  );
  if (consolidatedDiff.hasModificationsOrDeletions) {
    throw new Error(
      "Strict diff check failed for consolidated contentMarkdown: modifications/deletions detected!",
    );
  }

  const enrichedPayload: Record<string, unknown> = {
    ...payload,
    sessions: enrichedSessions,
    contentMarkdown: enrichedConsolidatedMd,
  };

  return {
    enrichedPayload,
    totalInsertedCharts,
    sessionResults,
    diffSummary: {
      consolidatedDiff,
      sessionDiffs,
    },
  };
}
