/**
 * Rule: JSON Leakage Repair.
 *
 * Detects and extracts clean Markdown from stringified JSON session envelopes,
 * leaked JSON payloads, or escaped JSON strings.
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Safely unwraps JSON markdown strings.
 */
function unwrapJson(raw: string): string | null {
  const trimmed = raw.trim();

  // Pattern A: Whole JSON object with contentMarkdown or sessions
  if (
    (trimmed.startsWith("{") && (trimmed.includes('"contentMarkdown"') || trimmed.includes('"kind"'))) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && (trimmed.includes("\\n") || trimmed.includes('\\"')))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        const nested = unwrapJson(parsed);
        return nested ?? parsed;
      }
      if (parsed && typeof parsed === "object") {
        if (typeof (parsed as { contentMarkdown?: unknown }).contentMarkdown === "string") {
          return (parsed as { contentMarkdown: string }).contentMarkdown;
        }
        if (
          Array.isArray((parsed as { sessions?: unknown[] }).sessions) &&
          (parsed as { sessions: Array<{ contentMarkdown?: string }> }).sessions.length > 0 &&
          typeof (parsed as { sessions: Array<{ contentMarkdown?: string }> }).sessions[0].contentMarkdown === "string"
        ) {
          return (parsed as { sessions: Array<{ contentMarkdown: string }> }).sessions
            .map((s) => s.contentMarkdown || "")
            .join("\n\n---\n\n");
        }
      }
    } catch {
      // Fallback regex if full JSON parsing fails due to unescaped internal quotes
      const match = trimmed.match(
        /"contentMarkdown"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"citationChunkIds"|"\s*,\s*"kind"|"\s*}|"$)/,
      );
      if (match && match[1]) {
        return match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
  }

  // Pattern B: Raw snippet of leaked JSON property inside a block
  if (/^\{\s*"kind"\s*:\s*"session"\s*,\s*"title"/i.test(trimmed)) {
    const match = trimmed.match(/"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*})/);
    if (match && match[1]) {
      return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }

  return null;
}

export function detectJsonLeakage(block: ContentBlock, _context: RepairContext): DetectionResult | null {
  const unwrapped = unwrapJson(block.raw);
  if (!unwrapped || unwrapped.trim() === block.raw.trim()) {
    return null;
  }

  return {
    detected: true,
    ruleId: "json-leakage",
    confidence: 0.98,
    confidenceLevel: "HIGH",
    reason: "نشت ساختار JSON در محتوای آموزشی شناسایی شد و به فرمت خالص Markdown تبدیل گردید.",
    repaired: unwrapped,
    changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
    changedPartAfter: unwrapped.length > 80 ? unwrapped.slice(0, 80) + "..." : unwrapped,
  };
}
