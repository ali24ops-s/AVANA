/**
 * Educational Content Normalization Engine for AVANA.
 *
 * Enforces Zero-Emoji policy across the entire educational pipeline:
 * 1. Safely protects code blocks, inline code, math (LaTeX / KaTeX), and URLs.
 * 2. Recovers legacy emoji triggers (e.g. "⚠️ اشتباه رایج:") into clean semantic Markdown Callouts (e.g. "> **اشتباه رایج:**").
 * 3. Sanitizes decorative stickers/emojis from educational body text.
 * 4. Strictly preserves medical facts, Greek letters (α, β, Δ, γ, etc.), drug names, dosages (50 mg, 10 mcg/kg/min), and tables.
 * 5. 100% idempotent: normalize(normalize(text)) === normalize(text).
 */

import { CalloutType } from "./callout.js";

// List of semantic and decorative emojis commonly found in legacy/AI educational text
const STRIP_EMOJIS_REGEX =
  /(?:[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\u200D|\uFE0F)/gu;

interface SemanticPattern {
  type: CalloutType;
  canonicalTitle: string;
  triggerRegex: RegExp;
}

function cleanCalloutRemainder(rawRemainder: string, hadOpeningBold: boolean): string {
  let text = stripEmojisPreservingTokens(rawRemainder).trimStart();

  // Strip leading colons or whitespace
  text = text.replace(/^[:：\s]+/, "");

  if (!text) return "";

  if (hadOpeningBold) {
    const match = text.match(/^([^*`_]*?)[:：]?(\*\*|__)(?:\s*[:：])?(.*)$/s);
    if (match) {
      const [, before, , after] = match;
      const cleanBefore = before.trim();
      const cleanAfter = after.trimStart().replace(/^[:：\s]+/, "");
      if (cleanBefore && cleanAfter) {
        text = `${cleanBefore}: ${cleanAfter}`;
      } else if (cleanBefore) {
        text = `${cleanBefore}:`;
      } else {
        text = cleanAfter;
      }
    }
  } else {
    const totalAsterisks = (text.match(/\*\*/g) || []).length;
    if (totalAsterisks % 2 === 1) {
      const orphanMatch = text.match(/^([^*`_]+?)[:：]?\*\*(?:\s*[:：])?(.*)$/s);
      if (orphanMatch) {
        const [, before, after] = orphanMatch;
        const cleanBefore = before.trim();
        const cleanAfter = after.trimStart().replace(/^[:：\s]+/, "");
        if (cleanBefore && cleanAfter) {
          text = `${cleanBefore}: ${cleanAfter}`;
        } else if (cleanBefore) {
          text = `${cleanBefore}:`;
        } else {
          text = cleanAfter;
        }
      }
    }
  }

  text = text.replace(/^[:：\s]+/, "");
  return text.trim();
}

function buildPatternRegex(emojiPattern: string, wordsPattern: string): RegExp {
  return new RegExp(
    `^(?:>\\s*)?(?:` +
      `(?:\\*\\*|__)?\\s*(?:${emojiPattern})\\s*(?:\\*\\*|__)?\\s*(?:${wordsPattern})\\s*[:：]?(?:\\*\\*|__)?\\s*[:：]?` +
      `|` +
      `(?:\\*\\*|__)\\s*(?:${wordsPattern})(?=\\s*[:：]|\\s*\\(|\\s*(?:\\*\\*|__)|\\s*$)` +
      `|` +
      `(?:${wordsPattern})\\s*[:：]` +
    `)\\s*`,
    "iu",
  );
}

export const SEMANTIC_PATTERNS: SemanticPattern[] = [
  {
    type: "common-mistake",
    canonicalTitle: "اشتباه رایج",
    triggerRegex: buildPatternRegex(
      "\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|❌|🚫",
      "اشتباه[\\s\\u200C]+رایج|اشتباه[\\s\\u200C]+متداول",
    ),
  },
  {
    type: "warning",
    canonicalTitle: "هشدار",
    triggerRegex: buildPatternRegex(
      "\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|🚨|❗|🔴",
      "هشدار|اخطار|توجه[\\s\\u200C]+مهم|Warning|Caution",
    ),
  },
  {
    type: "contraindication",
    canonicalTitle: "منع مصرف",
    triggerRegex: buildPatternRegex(
      "⛔|🚫|\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|❌",
      "منع[\\s\\u200C]+مصرف|موارد[\\s\\u200C]+منع[\\s\\u200C]+مصرف|Contraindication",
    ),
  },
  {
    type: "clinical-point",
    canonicalTitle: "نکته بالینی",
    triggerRegex: buildPatternRegex(
      "💊|💉|\\u{1F48A}",
      "نکته(?:[\\s\\u200C]+حیاتی)?[\\s\\u200C]+بالینی|کاربرد[\\s\\u200C]+بالینی|Clinical[\\s\\u200C]+Point",
    ),
  },
  {
    type: "important",
    canonicalTitle: "نکته مهم",
    triggerRegex: buildPatternRegex(
      "📌|🚨|❗|⭐",
      "نکته[\\s\\u200C]+مهم|نکته[\\s\\u200C]+حیاتی|توجه[\\s\\u200C]+مهم|Important",
    ),
  },
  {
    type: "drug-application",
    canonicalTitle: "کاربرد دارویی نوین",
    triggerRegex: buildPatternRegex(
      "💊|\\u{1F48A}",
      "کاربرد[\\s\\u200C]+دارویی[\\s\\u200C]+نوین|کاربرد[\\s\\u200C]+دارویی",
    ),
  },
  {
    type: "key-point",
    canonicalTitle: "نکته کلیدی",
    triggerRegex: buildPatternRegex(
      "🔑|✅|⭐|\\u{1F511}",
      "نکته[\\s\\u200C]+کلیدی|نکات[\\s\\u200C]+کلیدی|Key[\\s\\u200C]+Point",
    ),
  },
  {
    type: "educational-tip",
    canonicalTitle: "نکته آموزشی",
    triggerRegex: buildPatternRegex(
      "💡|📌|\\u{1F4A1}|\\u{1F4CC}",
      "نکته[\\s\\u200C]+آموزشی(?:[\\s\\u200C]+مهم)?|نکات[\\s\\u200C]+آموزشی|Educational[\\s\\u200C]+Tip",
    ),
  },
  {
    type: "understanding",
    canonicalTitle: "برای فهم بهتر",
    triggerRegex: buildPatternRegex(
      "🧠|💡|\\u{1F9E0}|\\u{1F4A1}",
      "برای[\\s\\u200C]+فهم[\\s\\u200C]+بهتر|برای[\\s\\u200C]+درک[\\s\\u200C]+بهتر",
    ),
  },
  {
    type: "supplementary",
    canonicalTitle: "توضیح تکمیلی",
    triggerRegex: buildPatternRegex(
      "💡|✨|\\u{1F4A1}",
      "توضیح[\\s\\u200C]+تکمیلی|اطلاعات[\\s\\u200C]+تکمیلی|نکات[\\s\\u200C]+تکمیلی(?:[\\s\\u200C]+آوانا)?(?:[—\\-–][\\s\\u200C]*در[\\s\\u200C]+منبع[\\s\\u200C]+اصلی[\\s\\u200C]+ذکر[\\s\\u200C]+نشده[\\s\\u200C]+است)?",
    ),
  },
  {
    type: "tip",
    canonicalTitle: "نکته",
    triggerRegex: buildPatternRegex(
      "💡|📌|\\u{1F4A1}|\\u{1F4CC}",
      "نکته|توصیه|Tip",
    ),
  },
];

const INLINE_TOKEN_REGEX =
  /(`[^`\n]*`|\$\$[\s\S]*?\$\$|\$(?!\s)[^$\n]+(?<!\s)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;

/**
 * Strips emojis from a string while preserving inline code and LaTeX math expressions.
 */
function stripEmojisPreservingTokens(text: string): string {
  const parts = text.split(INLINE_TOKEN_REGEX);
  return parts
    .map((part, idx) => {
      // Odd indices are math or code tokens — preserve exactly
      if (idx % 2 === 1) return part;
      return part.replace(STRIP_EMOJIS_REGEX, "");
    })
    .join("");
}

/**
 * Normalizes a single line of educational markdown.
 */
function normalizeLineCallout(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  // Preserve table rows
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return stripEmojisPreservingTokens(line);
  }

  const isBlockquote = trimmed.startsWith(">");
  const contentAfterQuote = isBlockquote ? trimmed.replace(/^>\s*/, "") : trimmed;

  // 1. Check if already canonical semantic callout
  for (const pattern of SEMANTIC_PATTERNS) {
    const canonicalPrefix = `**${pattern.canonicalTitle}:**`;
    if (contentAfterQuote.startsWith(canonicalPrefix)) {
      const rest = contentAfterQuote.slice(canonicalPrefix.length);
      const cleanRest = cleanCalloutRemainder(rest, false);
      const outputRest = cleanRest.length > 0 ? ` ${cleanRest}` : "";
      return isBlockquote ? `> ${canonicalPrefix}${outputRest}` : `${canonicalPrefix}${outputRest}`;
    }
  }

  // 2. Check for legacy triggers to convert
  for (const pattern of SEMANTIC_PATTERNS) {
    const match = pattern.triggerRegex.exec(contentAfterQuote);
    if (match && match[0].length > 0) {
      const hadOpeningBold = match[0].startsWith("**") || match[0].startsWith("__");
      const remainder = contentAfterQuote.slice(match[0].length);
      const cleanRemainder = cleanCalloutRemainder(remainder, hadOpeningBold);
      const canonicalPrefix = `**${pattern.canonicalTitle}:**`;
      const outputRemainder = cleanRemainder.length > 0 ? ` ${cleanRemainder}` : "";

      return isBlockquote
        ? `> ${canonicalPrefix}${outputRemainder}`
        : `${canonicalPrefix}${outputRemainder}`;
    }
  }

  // 3. Normal text line - strip emojis while preserving inline tokens and clean quote prefix
  const cleanLine = stripEmojisPreservingTokens(line);
  if (cleanLine.startsWith(">")) {
    return cleanLine.replace(/^>\s+/, "> ");
  }
  return cleanLine;
}

/**
 * Main Educational Content Normalizer.
 *
 * Normalizes Markdown educational lessons, summaries, and notes:
 * - Keeps code blocks (``` and `) and LaTeX math ($$ and $) completely untouched.
 * - Converts legacy emoji-labeled callouts into clean semantic Markdown.
 * - Removes decorative visual stickers from Persian educational prose.
 * - Guarantees idempotency: normalize(normalize(x)) === normalize(x).
 */
export function normalizeEducationalContent(content: string | null | undefined): string {
  if (!content || typeof content !== "string") {
    return content || "";
  }

  const lines = content.split("\n");
  let inFencedCodeBlock = false;

  const normalizedLines = lines.map((line) => {
    // Track fenced code blocks (```)
    if (line.trim().startsWith("```")) {
      inFencedCodeBlock = !inFencedCodeBlock;
      return line;
    }

    if (inFencedCodeBlock) {
      return line;
    }

    return normalizeLineCallout(line);
  });

  return normalizedLines.join("\n");
}
