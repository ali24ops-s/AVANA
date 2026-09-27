import { describe, it, expect } from "vitest";
import {
  ContentRepairEngine,
  ALL_REPAIR_RULES,
  type AuditLessonInput,
  computeContentHash,
} from "../content-repair/index.js";

describe("Content Corruption Audit Engine (Domain)", () => {
  const lesson1: AuditLessonInput = {
    id: "lesson-1",
    title: "مقدمه فیزیولوژی",
    contentMarkdown: "# مقدمه فیزیولوژی\n\nاین یک درس کاملاً سالم است.",
  };

  const lesson2: AuditLessonInput = {
    id: "lesson-2",
    title: "شیمی آلی",
    contentMarkdown: "# واکنش هیدرولیز\n\nفرمول واکنش: textCaC_2 + 2textH 2O",
  };

  const lesson3: AuditLessonInput = {
    id: "lesson-3",
    title: "فارماکولوژی",
    contentMarkdown: JSON.stringify({
      kind: "session",
      title: "جلسه فارماکولوژی",
      contentMarkdown: "# فارماکولوژی\n\nداروهای فشار خون.",
    }),
  };

  const lesson4: AuditLessonInput = {
    id: "lesson-4",
    title: "بیوشیمی بالینی",
    contentMarkdown: '# بیوشیمی\n\n- داده‌های آزمایشگاهی,\n "citationChunkIds": ["c0a80124-7b12-4a56-89de-123456789abc"] }',
  };

  const lesson5: AuditLessonInput = {
    id: "lesson-5",
    title: "آناتومی",
    contentMarkdown: "# آناتومی\n\n0.62\n0.62\n\nپایان درسنامه.",
  };

  const dataset: AuditLessonInput[] = [lesson1, lesson2, lesson3, lesson4, lesson5];

  it("1. Scans all lessons and aggregates total metrics correctly", () => {
    const report = ContentRepairEngine.audit(dataset);

    expect(report.totalLessonsScanned).toBe(5);
    expect(report.totalBlocksScanned).toBeGreaterThan(5);
    expect(report.lessonsWithCorruption).toBe(4); // lessons 2, 3, 4, 5
    expect(report.totalCorruptionFindings).toBe(4);
    expect(report.ruleSummaries).toHaveLength(ALL_REPAIR_RULES.length);
  });

  it("2. Reports all 7 rules with accurate triggered status and counts", () => {
    const report = ContentRepairEngine.audit(dataset);

    const latexCmd = report.ruleSummaries.find((r) => r.ruleId === "latex-command-corruption");
    expect(latexCmd).toBeDefined();
    expect(latexCmd?.triggered).toBe(true);
    expect(latexCmd?.triggerCount).toBe(1);
    expect(latexCmd?.affectedLessonCount).toBe(1);
    expect(latexCmd?.samples).toHaveLength(1);
    expect(latexCmd?.samples[0].before).toContain("textCaC_2");
    expect(latexCmd?.samples[0].suggested).toContain("\\text{CaC}_2");

    const jsonLeak = report.ruleSummaries.find((r) => r.ruleId === "json-leakage");
    expect(jsonLeak).toBeDefined();
    expect(jsonLeak?.triggered).toBe(true);
    expect(jsonLeak?.triggerCount).toBe(1);

    const unusedRule = report.ruleSummaries.find((r) => r.ruleId === "broken-whitespace");
    expect(unusedRule).toBeDefined();
    expect(unusedRule?.triggered).toBe(false);
    expect(unusedRule?.triggerCount).toBe(0);
    expect(unusedRule?.affectedLessonCount).toBe(0);
    expect(unusedRule?.samples).toHaveLength(0);
  });

  it("3. Limits samples to at most 5 per rule and truncates long snippets", () => {
    // Generate 10 lessons with the same corruption
    const manyCorruptedLessons: AuditLessonInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: `lesson-dup-${i}`,
      title: `درس تکراری ${i}`,
      contentMarkdown: `# عنوان\n\n${"طولانی ".repeat(100)}\n\ntextCaC_2 + 2textH 2O`,
    }));

    const report = ContentRepairEngine.audit(manyCorruptedLessons);
    const rule = report.ruleSummaries.find((r) => r.ruleId === "latex-command-corruption");

    expect(rule).toBeDefined();
    expect(rule?.triggerCount).toBe(10);
    expect(rule?.affectedLessonCount).toBe(10);
    // Samples must be capped at 5
    expect(rule?.samples.length).toBe(5);
    // Snippets must not exceed 400 chars
    for (const sample of rule!.samples) {
      expect(sample.before.length).toBeLessThanOrEqual(400);
      expect(sample.suggested.length).toBeLessThanOrEqual(400);
    }
  });

  it("4. Determinism: Consecutive audit runs produce identical reports", () => {
    const report1 = ContentRepairEngine.audit(dataset);
    const report2 = ContentRepairEngine.audit(dataset);

    expect(report1.totalLessonsScanned).toBe(report2.totalLessonsScanned);
    expect(report1.totalBlocksScanned).toBe(report2.totalBlocksScanned);
    expect(report1.totalCorruptionFindings).toBe(report2.totalCorruptionFindings);
    expect(report1.overallConfidence).toEqual(report2.overallConfidence);

    expect(report1.ruleSummaries.map((r) => ({ id: r.ruleId, count: r.triggerCount }))).toEqual(
      report2.ruleSummaries.map((r) => ({ id: r.ruleId, count: r.triggerCount })),
    );
  });

  it("5. Read-only verification: Audit does not mutate input lesson objects or content hashes", () => {
    const hashesBefore = dataset.map((l) => computeContentHash(l.contentMarkdown));

    ContentRepairEngine.audit(dataset);

    const hashesAfter = dataset.map((l) => computeContentHash(l.contentMarkdown));
    expect(hashesAfter).toEqual(hashesBefore);
  });
});
