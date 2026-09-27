/**
 * Deterministic Content Repair Engine for AVANA.
 *
 * Provides high-precision, block-level deterministic repair of educational content
 * without AI dependencies, preserving 100% of unaffected blocks.
 */

import type {
  ApplyRepairInput,
  ApplyRepairResult,
  AuditLessonInput,
  ContentBlock,
  ContentCorruptionAuditReport,
  DetectionResult,
  RepairCandidate,
  RepairContext,
  RepairPreviewResult,
  RepairRuleId,
  RuleAuditSample,
  RuleAuditSummary,
} from "./types.js";
import { splitMarkdownDocument, rebuildMarkdownDocument } from "./block-splitter.js";
import { detectJsonLeakage } from "./rules/json-leakage.js";
import { detectLatexCommandCorruption } from "./rules/latex-command-corruption.js";
import { detectLatexDelimiterCorruption } from "./rules/latex-delimiter-corruption.js";
import { detectDuplicatedFragment } from "./rules/duplicated-fragment.js";
import { detectTrailingMetadataLeakage } from "./rules/trailing-metadata-leakage.js";
import { detectBrokenWhitespace } from "./rules/broken-whitespace.js";
import { detectUnicodeFormattingCorruption } from "./rules/unicode-formatting-corruption.js";
import { validateRepairedContent } from "./validator.js";

type DetectorFunction = (block: ContentBlock, context: RepairContext) => DetectionResult | null;

export const ALL_REPAIR_RULES: Array<{ ruleId: RepairRuleId; ruleName: string }> = [
  { ruleId: "json-leakage", ruleName: "نشت ساختار JSON / داده‌های خام" },
  { ruleId: "latex-command-corruption", ruleName: "خرابی دستور فرمول / شیمی" },
  { ruleId: "latex-delimiter-corruption", ruleName: "خرابی دلیمیتر فرمول ریاضی" },
  { ruleId: "duplicated-fragment", ruleName: "تکرار متوالی خطوط و فرمول‌ها" },
  { ruleId: "trailing-metadata-leakage", ruleName: "نشت فراداده ارجاع و شناسه‌ها در انتها" },
  { ruleId: "broken-whitespace", ruleName: "شکستگی خطوط فرمول و کلمات" },
  { ruleId: "unicode-formatting-corruption", ruleName: "کاراکترهای کنترلی و نامعتبر یونیکد" },
];

const DETECTOR_PIPELINE: Array<{ ruleId: RepairRuleId; detector: DetectorFunction }> = [
  { ruleId: "unicode-formatting-corruption", detector: detectUnicodeFormattingCorruption },
  { ruleId: "json-leakage", detector: detectJsonLeakage },
  { ruleId: "trailing-metadata-leakage", detector: detectTrailingMetadataLeakage },
  { ruleId: "broken-whitespace", detector: detectBrokenWhitespace },
  { ruleId: "latex-command-corruption", detector: detectLatexCommandCorruption },
  { ruleId: "latex-delimiter-corruption", detector: detectLatexDelimiterCorruption },
  { ruleId: "duplicated-fragment", detector: detectDuplicatedFragment },
];

/**
 * Computes a deterministic SHA-like hexadecimal hash of content for optimistic concurrency.
 */
export function computeContentHash(content: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashVal = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hashVal.toString(16).padStart(12, "0");
}

export class ContentRepairEngine {
  /**
   * Detects all repairable issues across blocks in a given Markdown document.
   */
  static detect(content: string): RepairCandidate[] {
    if (!content || typeof content !== "string") {
      return [];
    }

    // Fast-path: Check if the entire document is a JSON wrapper before block splitting
    const trimmed = content.trim();
    if (
      (trimmed.startsWith("{") && (trimmed.includes('"contentMarkdown"') || trimmed.includes('"kind"'))) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.includes('\\"'))
    ) {
      const rootBlock: ContentBlock = {
        id: "b_root_0",
        index: 0,
        type: "paragraph",
        raw: content,
        startOffset: 0,
        endOffset: content.length,
      };
      const jsonRes = detectJsonLeakage(rootBlock, {
        blockIndex: 0,
        totalBlocks: 1,
        fullContent: content,
      });
      if (jsonRes && jsonRes.detected) {
        return [
          {
            ruleId: "json-leakage",
            blockIndex: 0,
            blockType: "paragraph",
            confidence: jsonRes.confidence,
            confidenceLevel: jsonRes.confidenceLevel,
            reason: jsonRes.reason,
            before: content,
            after: jsonRes.repaired,
            diff: {
              before: content,
              after: jsonRes.repaired,
              changedPartBefore: jsonRes.changedPartBefore,
              changedPartAfter: jsonRes.changedPartAfter,
            },
          },
        ];
      }
    }

    const { blocks } = splitMarkdownDocument(content);
    const candidates: RepairCandidate[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const context: RepairContext = {
        fullContent: content,
        blockIndex: i,
        totalBlocks: blocks.length,
        previousBlock: i > 0 ? blocks[i - 1] : undefined,
        nextBlock: i < blocks.length - 1 ? blocks[i + 1] : undefined,
      };

      let currentRaw = block.raw;

      for (const entry of DETECTOR_PIPELINE) {
        const candidateBlock: ContentBlock = {
          ...block,
          raw: currentRaw,
        };
        const result = entry.detector(candidateBlock, context);
        if (result && result.detected && result.repaired !== currentRaw) {
          candidates.push({
            ruleId: result.ruleId,
            blockIndex: i,
            blockType: block.type,
            confidence: result.confidence,
            confidenceLevel: result.confidenceLevel,
            reason: result.reason,
            before: currentRaw,
            after: result.repaired,
            diff: {
              before: currentRaw,
              after: result.repaired,
              changedPartBefore: result.changedPartBefore,
              changedPartAfter: result.changedPartAfter,
            },
          });
          currentRaw = result.repaired;
        }
      }
    }

    return candidates;
  }

  /**
   * Generates a preview of repairs with before/after diffs, hashes, and validation status.
   */
  static preview(
    content: string,
    options?: {
      filterRuleIds?: RepairRuleId[];
      filterBlockIndices?: number[];
    },
  ): RepairPreviewResult {
    const originalHash = computeContentHash(content || "");
    if (!content) {
      return {
        originalContent: "",
        originalHash,
        repairedContent: "",
        repairedHash: originalHash,
        hasRepairs: false,
        totalBlocks: 0,
        repairedBlockCount: 0,
        candidates: [],
        validation: { valid: true, errors: [] },
      };
    }

    const allCandidates = this.detect(content);
    const filteredCandidates = allCandidates.filter((c) => {
      if (options?.filterRuleIds && !options.filterRuleIds.includes(c.ruleId)) {
        return false;
      }
      if (options?.filterBlockIndices && !options.filterBlockIndices.includes(c.blockIndex)) {
        return false;
      }
      return true;
    });

    if (filteredCandidates.length === 0) {
      return {
        originalContent: content,
        originalHash,
        repairedContent: content,
        repairedHash: originalHash,
        hasRepairs: false,
        totalBlocks: splitMarkdownDocument(content).blocks.length,
        repairedBlockCount: 0,
        candidates: [],
        validation: { valid: true, errors: [] },
      };
    }

    // Fast-path: if single candidate is document-level JSON unwrap
    if (
      filteredCandidates.length === 1 &&
      filteredCandidates[0].ruleId === "json-leakage" &&
      filteredCandidates[0].before === content
    ) {
      const rep = filteredCandidates[0].after;
      const val = validateRepairedContent(content, rep);
      return {
        originalContent: content,
        originalHash,
        repairedContent: rep,
        repairedHash: computeContentHash(rep),
        hasRepairs: true,
        totalBlocks: 1,
        repairedBlockCount: 1,
        candidates: filteredCandidates,
        validation: val,
      };
    }

    // Apply repairs to blocks
    const { blocks, separators } = splitMarkdownDocument(content);
    const repairedBlocks = blocks.map((b) => ({ ...b }));
    const modifiedBlockIndices = new Set<number>();

    for (const candidate of filteredCandidates) {
      if (candidate.blockIndex >= 0 && candidate.blockIndex < repairedBlocks.length) {
        repairedBlocks[candidate.blockIndex].raw = candidate.after;
        modifiedBlockIndices.add(candidate.blockIndex);
      }
    }

    const repairedContent = rebuildMarkdownDocument(repairedBlocks, separators);
    const validation = validateRepairedContent(content, repairedContent);

    return {
      originalContent: content,
      originalHash,
      repairedContent,
      repairedHash: computeContentHash(repairedContent),
      hasRepairs: modifiedBlockIndices.size > 0,
      totalBlocks: blocks.length,
      repairedBlockCount: modifiedBlockIndices.size,
      candidates: filteredCandidates,
      validation,
    };
  }

  /**
   * Applies approved repairs with optimistic concurrency check and post-repair validation.
   */
  static apply(content: string, input: ApplyRepairInput): ApplyRepairResult {
    const currentHash = computeContentHash(content || "");

    // Optimistic concurrency check
    if (input.originalHash && input.originalHash !== currentHash) {
      return {
        success: false,
        originalContent: content,
        repairedContent: content,
        contentHash: currentHash,
        appliedCandidates: [],
        repairedBlockCount: 0,
        validation: {
          valid: false,
          errors: ["Repair rejected: content changed since preview (عدم تطابق نسخه محتوا)."],
        },
      };
    }

    const previewResult = this.preview(content, {
      filterRuleIds: input.appliedRuleIds,
      filterBlockIndices: input.appliedBlockIndices,
    });

    if (!previewResult.validation.valid) {
      return {
        success: false,
        originalContent: content,
        repairedContent: content,
        contentHash: currentHash,
        appliedCandidates: [],
        repairedBlockCount: 0,
        validation: previewResult.validation,
      };
    }

    return {
      success: true,
      originalContent: content,
      repairedContent: previewResult.repairedContent,
      contentHash: previewResult.repairedHash,
      appliedCandidates: previewResult.candidates,
      validation: previewResult.validation,
      repairedBlockCount: previewResult.repairedBlockCount,
    };
  }

  /**
   * Performs a strictly read-only corruption audit across a collection of lessons.
   * Does NOT modify, repair, or mutate any lesson content.
   */
  static audit(lessons: AuditLessonInput[]): ContentCorruptionAuditReport {
    let totalBlocksScanned = 0;
    let lessonsWithCorruption = 0;
    let totalCorruptionFindings = 0;

    const overallConfidence = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const ruleSummariesMap = new Map<
      RepairRuleId,
      {
        ruleId: RepairRuleId;
        ruleName: string;
        triggered: boolean;
        triggerCount: number;
        affectedLessons: Set<string>;
        affectedBlocks: Set<string>;
        confidenceBreakdown: { HIGH: number; MEDIUM: number; LOW: number };
        samples: RuleAuditSample[];
      }
    >();

    for (const rule of ALL_REPAIR_RULES) {
      ruleSummariesMap.set(rule.ruleId, {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        triggered: false,
        triggerCount: 0,
        affectedLessons: new Set<string>(),
        affectedBlocks: new Set<string>(),
        confidenceBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        samples: [],
      });
    }

    for (const lesson of lessons) {
      const content = lesson.contentMarkdown || "";
      const { blocks } = splitMarkdownDocument(content);
      totalBlocksScanned += blocks.length;

      const candidates = this.detect(content);
      if (candidates.length > 0) {
        lessonsWithCorruption++;
        totalCorruptionFindings += candidates.length;

        for (const candidate of candidates) {
          overallConfidence[candidate.confidenceLevel]++;

          const summary = ruleSummariesMap.get(candidate.ruleId);
          if (summary) {
            summary.triggered = true;
            summary.triggerCount++;
            summary.affectedLessons.add(lesson.id);
            summary.affectedBlocks.add(`${lesson.id}:${candidate.blockIndex}`);
            summary.confidenceBreakdown[candidate.confidenceLevel]++;

            if (summary.samples.length < 5) {
              const maxSnippet = 350;
              const truncate = (s: string) =>
                s.length > maxSnippet ? `${s.slice(0, maxSnippet)}...` : s;
              summary.samples.push({
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                blockIndex: candidate.blockIndex,
                confidence: candidate.confidence,
                confidenceLevel: candidate.confidenceLevel,
                reason: candidate.reason,
                before: truncate(candidate.before),
                suggested: truncate(candidate.after),
              });
            }
          }
        }
      }
    }

    const ruleSummaries: RuleAuditSummary[] = Array.from(ruleSummariesMap.values()).map(
      (s) => ({
        ruleId: s.ruleId,
        ruleName: s.ruleName,
        triggered: s.triggered,
        triggerCount: s.triggerCount,
        affectedLessonCount: s.affectedLessons.size,
        affectedBlockCount: s.affectedBlocks.size,
        confidenceBreakdown: s.confidenceBreakdown,
        samples: s.samples,
      }),
    );

    return {
      totalLessonsScanned: lessons.length,
      totalBlocksScanned,
      lessonsWithCorruption,
      totalCorruptionFindings,
      overallConfidence,
      ruleSummaries,
      scannedAt: new Date().toISOString(),
    };
  }
}
