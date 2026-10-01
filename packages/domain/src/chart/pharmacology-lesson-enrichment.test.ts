import { describe, it, expect } from "vitest";
import {
  PHARMACOLOGY_CANONICAL_CHARTS,
  PHARMACOLOGY_SESSION_ANCHORS,
  TARGET_PHARMACOLOGY_LESSON,
  stripEducationalChartBlocks,
  enrichSessionMarkdown,
  enrichPharmacologyLessonPayload,
} from "./pharmacology-lesson-enrichment.js";
import { validateEducationalChart } from "./chart-validation.js";
import fs from "fs";

// Load actual session markdowns dumped from DB if available, or realistic mocks
function getSampleSessionMarkdown(sessionIndex: number): string {
  const filePath = `/tmp/session_${sessionIndex + 1}.md`;
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }

  // Fallback realistic mocks if /tmp files are not present
  const anchor = PHARMACOLOGY_SESSION_ANCHORS.find((a) => a.sessionIndex === sessionIndex);
  if (anchor) {
    return `# عنوان تستی جلسه ${sessionIndex + 1}\n\nمتن مقدماتی درس.\n\n${anchor.beforeAnchor}\n\n${anchor.afterAnchor}\n\nادامه متن جلسه.`;
  }
  return `# جلسه ${sessionIndex + 1}\n\nمتن جلسه عمومی بدون نمودار.`;
}

function getSampleFullPayload(): Record<string, unknown> {
  const sessions = [];
  for (let i = 0; i < 10; i++) {
    sessions.push({
      title: `جلسه ${i + 1}`,
      contentMarkdown: getSampleSessionMarkdown(i),
    });
  }

  const consolidated =
    "# فهرست جلسات\n\n" +
    sessions.map((s) => s.contentMarkdown).join("\n\n");

  return {
    kind: "lesson",
    title: TARGET_PHARMACOLOGY_LESSON.title,
    moduleTitle: TARGET_PHARMACOLOGY_LESSON.title,
    sessions,
    contentMarkdown: consolidated,
  };
}

describe("Pharmacology Lesson Chart Enrichment Suite", () => {
  // -------------------------------------------------------------------------
  // Test 1: Content Preservation (Byte-for-byte equality after stripping charts)
  // -------------------------------------------------------------------------
  it("Test 1: preserves original non-chart content byte-for-byte across all sessions", () => {
    for (let i = 0; i < 10; i++) {
      const originalMd = getSampleSessionMarkdown(i);
      const { enrichedMarkdown } = enrichSessionMarkdown(i, originalMd);
      const stripped = stripEducationalChartBlocks(enrichedMarkdown);
      expect(stripped).toBe(originalMd);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: Exactly 4 Charts Added
  // -------------------------------------------------------------------------
  it("Test 2: adds exactly 4 canonical charts across the 10 sessions", () => {
    const payload = getSampleFullPayload();
    const result = enrichPharmacologyLessonPayload(payload);

    expect(result.totalInsertedCharts).toBe(4);

    const insertedIndices = result.sessionResults
      .filter((r) => r.inserted)
      .map((r) => r.sessionIndex);

    // Sessions 4, 5, 6, 7 (indices 3, 4, 5, 6)
    expect(insertedIndices).toEqual([3, 4, 5, 6]);

    // Sessions 1, 2, 3, 8, 9, 10 must NOT have charts inserted
    const nonInserted = result.sessionResults.filter((r) => !r.inserted);
    expect(nonInserted.map((r) => r.sessionIndex)).toEqual([0, 1, 2, 7, 8, 9]);
  });

  // -------------------------------------------------------------------------
  // Test 3: Conceptual Mode Invariant
  // -------------------------------------------------------------------------
  it("Test 3: ensures all 4 canonical charts have mode === 'conceptual'", () => {
    const charts = [
      PHARMACOLOGY_CANONICAL_CHARTS.doseResponse,
      PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist,
      PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist,
      PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist,
    ];

    expect(charts).toHaveLength(4);
    for (const chart of charts) {
      expect(chart.mode).toBe("conceptual");
      expect(chart.xAxis?.scale).toBe("log");
      expect(chart.curves).toBeDefined();
      expect(chart.curves!.length).toBeGreaterThan(0);
      for (const curve of chart.curves!) {
        expect(curve.parameterSemantics).toBe("normalized");
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: validateEducationalChart passes for all charts
  // -------------------------------------------------------------------------
  it("Test 4: validates all 4 canonical charts with validateEducationalChart with 0 errors", () => {
    const charts = [
      PHARMACOLOGY_CANONICAL_CHARTS.doseResponse,
      PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist,
      PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist,
      PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist,
    ];

    for (const chart of charts) {
      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: Competitive Antagonist Rightward Shift & Emax Preservation
  // -------------------------------------------------------------------------
  it("Test 5: verifies competitive antagonist preserves Emax and shifts EC50 to the right", () => {
    const chart = PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist;
    expect(chart.curves).toHaveLength(3);

    const [cAgonist, cLowAntag, cHighAntag] = chart.curves!;

    // Emax preservation
    expect(cAgonist.parameters.emax).toBe(100);
    expect(cLowAntag.parameters.emax).toBe(100);
    expect(cHighAntag.parameters.emax).toBe(100);

    // Rightward shift: logEC50 increases (e.g. -8 -> -7 -> -6, which is 10 nM -> 100 nM -> 1 uM)
    expect(cAgonist.parameters.logEC50).toBe(-8);
    expect(cLowAntag.parameters.logEC50).toBe(-7);
    expect(cHighAntag.parameters.logEC50).toBe(-6);

    expect(cLowAntag.parameters.logEC50).toBeGreaterThan(cAgonist.parameters.logEC50);
    expect(cHighAntag.parameters.logEC50).toBeGreaterThan(cLowAntag.parameters.logEC50);
  });

  // -------------------------------------------------------------------------
  // Test 6: Full vs Partial Agonist Efficacy Ceiling
  // -------------------------------------------------------------------------
  it("Test 6: verifies full vs partial agonist demonstrates lower Emax ceiling", () => {
    const chart = PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist;
    expect(chart.curves).toHaveLength(2);

    const [full, partial] = chart.curves!;
    expect(full.parameters.emax).toBe(100);
    expect(partial.parameters.emax).toBe(45);
    expect(full.parameters.emax).toBeGreaterThan(partial.parameters.emax);
  });

  // -------------------------------------------------------------------------
  // Test 7: Inverse Agonist Basal Activity Suppression
  // -------------------------------------------------------------------------
  it("Test 7: verifies inverse agonist suppresses basal constitutive activity below baseline", () => {
    const chart = PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist;
    expect(chart.curves).toHaveLength(3);

    const [full, neutral, inverse] = chart.curves!;
    const basal = 25;

    expect(full.parameters.baseline).toBe(basal);
    expect(neutral.parameters.baseline).toBe(basal);
    expect(inverse.parameters.baseline).toBe(basal);

    expect(full.parameters.emax).toBe(100);
    expect(neutral.parameters.emax).toBe(basal);
    expect(inverse.parameters.emax).toBe(0);

    // Inverse agonist brings response below baseline
    expect(inverse.parameters.emax).toBeLessThan(basal);
  });

  // -------------------------------------------------------------------------
  // Test 8: Idempotency (enrich(enrich(x)) === enrich(x))
  // -------------------------------------------------------------------------
  it("Test 8: confirms strict idempotency: second enrichment run does not duplicate charts", () => {
    const payload = getSampleFullPayload();
    const run1 = enrichPharmacologyLessonPayload(payload);
    expect(run1.totalInsertedCharts).toBe(4);

    const run2 = enrichPharmacologyLessonPayload(run1.enrichedPayload);
    expect(run2.totalInsertedCharts).toBe(0);

    const sessions1 = (run1.enrichedPayload.sessions as Array<{ contentMarkdown: string }>);
    const sessions2 = (run2.enrichedPayload.sessions as Array<{ contentMarkdown: string }>);

    for (let i = 0; i < 10; i++) {
      expect(sessions2[i].contentMarkdown).toBe(sessions1[i].contentMarkdown);
    }
    expect(run2.enrichedPayload.contentMarkdown).toBe(run1.enrichedPayload.contentMarkdown);
  });

  // -------------------------------------------------------------------------
  // Test 9: Strict Raw Diff Verification (No deletions or alterations)
  // -------------------------------------------------------------------------
  it("Test 9: confirms raw diff contains strictly additions of chart fences and 0 deletions", () => {
    const payload = getSampleFullPayload();
    const run = enrichPharmacologyLessonPayload(payload);

    expect(run.diffSummary.consolidatedDiff.hasModificationsOrDeletions).toBe(false);
    expect(run.diffSummary.consolidatedDiff.removedLinesCount).toBe(0);
    expect(run.diffSummary.consolidatedDiff.addedLinesCount).toBeGreaterThan(0);

    for (let i = 0; i < 10; i++) {
      const sDiff = run.diffSummary.sessionDiffs[i];
      expect(sDiff.hasModificationsOrDeletions).toBe(false);
      expect(sDiff.removedLinesCount).toBe(0);
      if ([3, 4, 5, 6].includes(i)) {
        expect(sDiff.addedLinesCount).toBeGreaterThan(0);
      } else {
        expect(sDiff.addedLinesCount).toBe(0);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 10: Non-target Sessions and Other Records Remain Untouched
  // -------------------------------------------------------------------------
  it("Test 10: ensures non-target sessions are byte-for-byte identical to their inputs", () => {
    const payload = getSampleFullPayload();
    const origSessions = (payload.sessions as Array<{ contentMarkdown: string }>).map((s) => s.contentMarkdown);
    const run = enrichPharmacologyLessonPayload(payload);
    const newSessions = (run.enrichedPayload.sessions as Array<{ contentMarkdown: string }>).map((s) => s.contentMarkdown);

    // Indices 0, 1, 2, 7, 8, 9 must be 100% identical
    for (const nonTargetIdx of [0, 1, 2, 7, 8, 9]) {
      expect(newSessions[nonTargetIdx]).toBe(origSessions[nonTargetIdx]);
    }
  });
});
