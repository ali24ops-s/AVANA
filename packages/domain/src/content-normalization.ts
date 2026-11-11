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

// List of semantic and decorative emojis commonly found in legacy/AI educational text.
// Strictly preserves:
// - Dingbat typography & process arrows (U+2794 to U+27BF, e.g. ➔, ➡, ➜, ➢, ➤)
// - Zero Width Joiner (\u200D) for Persian cursive typography & ligatures
const STRIP_EMOJIS_REGEX =
  /(?:[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{2793}]|\uFE0F)/gu;

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
      "\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|❌|🚫|🚨|❗",
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
      "⛔|🚫|\\u26A0\\uFE0F|\\u26A0|⚠️|⚠|❌|🚨",
      "منع[\\s\\u200C]+مصرف|موارد[\\s\\u200C]+منع[\\s\\u200C]+مصرف|Contraindication",
    ),
  },
  {
    type: "clinical-point",
    canonicalTitle: "نکته بالینی",
    triggerRegex: buildPatternRegex(
      "💊|💉|\\u{1F48A}|💡|📌|⭐|✨|🚨|❗|⚠️",
      "نکته(?:[\\s\\u200C]+حیاتی)?[\\s\\u200C]+بالینی|کاربرد[\\s\\u200C]+بالینی|Clinical[\\s\\u200C]+Point",
    ),
  },
  {
    type: "important",
    canonicalTitle: "نکته مهم",
    triggerRegex: buildPatternRegex(
      "📌|🚨|❗|⭐|💡|⚠️",
      "نکته[\\s\\u200C]+مهم|نکته[\\s\\u200C]+حیاتی|توجه[\\s\\u200C]+مهم|Important",
    ),
  },
  {
    type: "drug-application",
    canonicalTitle: "کاربرد دارویی نوین",
    triggerRegex: buildPatternRegex(
      "💊|\\u{1F48A}|💡|✨",
      "کاربرد[\\s\\u200C]+دارویی[\\s\\u200C]+نوین|کاربرد[\\s\\u200C]+دارویی",
    ),
  },
  {
    type: "key-point",
    canonicalTitle: "نکته کلیدی",
    triggerRegex: buildPatternRegex(
      "🔑|✅|⭐|\\u{1F511}|💡|📌",
      "نکته[\\s\\u200C]+کلیدی|نکات[\\s\\u200C]+کلیدی|Key[\\s\\u200C]+Point",
    ),
  },
  {
    type: "educational-tip",
    canonicalTitle: "نکته آموزشی",
    triggerRegex: buildPatternRegex(
      "💡|📌|\\u{1F4A1}|\\u{1F4CC}|⭐|✨",
      "نکته[\\s\\u200C]+آموزشی(?:[\\s\\u200C]+مهم)?|نکات[\\s\\u200C]+آموزشی|Educational[\\s\\u200C]+Tip",
    ),
  },
  {
    type: "understanding",
    canonicalTitle: "برای فهم بهتر",
    triggerRegex: buildPatternRegex(
      "🧠|💡|\\u{1F9E0}|\\u{1F4A1}|✨",
      "برای[\\s\\u200C]+فهم[\\s\\u200C]+بهتر|برای[\\s\\u200C]+درک[\\s\\u200C]+بهتر",
    ),
  },
  {
    type: "supplementary",
    canonicalTitle: "توضیح تکمیلی",
    triggerRegex: buildPatternRegex(
      "💡|✨|\\u{1F4A1}|📌",
      "توضیح[\\s\\u200C]+تکمیلی|اطلاعات[\\s\\u200C]+تکمیلی|نکات[\\s\\u200C]+تکمیلی(?:[\\s\\u200C]+آوانا)?(?:[—\\-–][\\s\\u200C]*در[\\s\\u200C]+منبع[\\s\\u200C]+اصلی[\\s\\u200C]+ذکر[\\s\\u200C]+نشده[\\s\\u200C]+است)?",
    ),
  },
  {
    type: "tip",
    canonicalTitle: "نکته",
    triggerRegex: buildPatternRegex(
      "💡|📌|\\u{1F4A1}|\\u{1F4CC}|⭐|✨",
      "نکته(?!\\s*(?:بالینی|آموزشی|کلیدی|مهم|حیاتی|دارویی|نوین))|توصیه|Tip",
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
 * Helper to unwrap raw JSON session or lesson envelopes if an object/JSON was accidentally passed as markdown string.
 */
function unwrapRawJsonMarkdown(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("{") && (trimmed.includes('"contentMarkdown"') || trimmed.includes('"kind"'))) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && (trimmed.includes("\\n") || trimmed.includes('\\"')))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return unwrapRawJsonMarkdown(parsed);
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
      // If full parse fails, try regex extraction of contentMarkdown
      const match = trimmed.match(/"contentMarkdown"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"citationChunkIds"|"\s*,\s*"kind"|"\s*}|"$)/);
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
  return raw;
}

/**
 * Sanitizes trailing leaked metadata artifacts (like leaked citationChunkIds UUID arrays or JSON residue).
 */
function sanitizeTrailingMetadata(text: string): string {
  let cleaned = text;

  // Remove leaked JSON trailing properties e.g. ',\n "citationChunkIds": [ ... ] }'
  cleaned = cleaned.replace(/,?\s*"citationChunkIds"\s*:\s*\[[\s\S]*?\]\s*}?$/s, "");
  cleaned = cleaned.replace(/,?\s*"kind"\s*:\s*"[^"]*"\s*}?$/s, "");

  // Remove standalone trailing lists of quoted UUIDs (e.g. "6945baa6-...", "5de9a319-...")
  cleaned = cleaned.replace(
    /(?:\n|^)\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*)+$/s,
    "",
  );

  return cleaned.trimEnd();
}

/**
 * Main Educational Content Normalizer.
 *
 * Normalizes Markdown educational lessons, summaries, and notes:
 * - Unwraps raw JSON payloads if stringified object was passed as markdown.
 * - Sanitizes trailing metadata/UUID leakages.
 * - Keeps code blocks (``` and `) and LaTeX math ($$ and $) completely untouched.
 * - Converts legacy emoji-labeled callouts into clean semantic Markdown.
 * - Removes decorative visual stickers from Persian educational prose.
 * - Guarantees idempotency: normalize(normalize(x)) === normalize(x).
 */
export function normalizeEducationalContent(content: string | null | undefined): string {
  if (!content || typeof content !== "string") {
    return content || "";
  }

  const unwrapped = unwrapRawJsonMarkdown(content);
  const sanitized = sanitizeTrailingMetadata(unwrapped);

  const lines = sanitized.split("\n");
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

/**
 * Helper to identify biomedical / scientific tokens that may have been incorrectly wrapped
 * in Markdown backticks by LLMs.
 */
export function isScientificToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;

  // STRICT PROGRAMMING GUARDS: Exclude real programming code, CLI commands, scripts, syntax
  if (
    /^(?:const|let|var|function|return|import|export|class|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|typeof|instanceof|void|delete|new|this|async|await|yield|console|npm|pnpm|yarn|bun|npx|git|docker|curl|wget|cd|ls|mkdir|rm|chmod|chown|ssh|sudo|pip|python|node|ts|js|select|insert|update|delete|from|where|order by|group by)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }

  // Code operators & constructs
  if (/[;={}[\]<>*+!~`"\\]/.test(trimmed)) {
    return false;
  }
  // Function calls like foo() or methods like arr.map()
  if (/\w+\([^)]*\)/.test(trimmed) || /\.\w+\(/.test(trimmed)) {
    return false;
  }
  // Dot property access or file paths
  if (trimmed.includes("./") || trimmed.startsWith("/") || /\w+\.\w+/.test(trimmed) || /[a-z0-9_]+\/[a-z0-9_]{3,}/i.test(trimmed)) {
    return false;
  }

  // 1. Specific biomedical prefixes & pathways
  if (/^(?:hsp|Hsp|HSP)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:FKBP|fkbp)\d+[a-zA-Z]?$/i.test(trimmed)) return true;
  if (/^(?:COX|cox)(?:-[1-3]|\d+)?$/i.test(trimmed)) return true;
  if (/^(?:CYP|cyp)\d+[A-Za-z]\d+$/i.test(trimmed)) return true;
  if (/^(?:GLUT|glut|SGLT|sglt)\d+$/i.test(trimmed)) return true;
  if (/^(?:JAK|jak|STAT|stat)\d+$/i.test(trimmed)) return true;
  if (/^(?:IL|il|TNF|tnf|INF|inf)(?:-[0-9a-zA-Zα-ωΑ-Ω]+)?$/i.test(trimmed)) return true;
  if (/^(?:p53|Bcl-2|mTOR|NF-kB|NF-κB|HMG-CoA)$/i.test(trimmed)) return true;

  // 2. Mixed-case biological messengers & nucleotides
  if (/^(?:cAMP|cGMP|mRNA|tRNA|rRNA|cDNA|HbA1c)$/i.test(trimmed)) return true;

  // 3. Uppercase & Mixed biomedical abbreviations
  if (/^[A-Z]{2,6}s?$/.test(trimmed)) return true;
  if (/^[A-Z]{2,5}(?:-[0-9A-Za-z]{1,3}|[0-9]{1,3})$/.test(trimmed)) return true;

  // 4. Clinical stages & classifications
  if (/^(?:Stage|Grade|Class|Type|Phase)\s+[0-9IVXAB]+(?:\s+[A-Za-z]+)?$/i.test(trimmed)) return true;

  // 5. Drug classes & multi-word medical categories
  if (
    /^(?:[A-Za-z0-9-]+\s+)*(?:inhibitor|inhibitors|blocker|blockers|agonist|agonists|antagonist|antagonists|diuretic|diuretics|channel|receptor|receptors|syndrome|disease|hypertension)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 6. Dosages, lab values & medical units
  if (
    /^\d+(?:\.\d+)?\s*(?:mg|mcg|μg|g|kg|mL|L|dL|mmol|mEq|IU|bpm|mmHg|mol)(?:\/(?:kg|day|hr|min|dL|L|dose))?(?:\/(?:min|hr|day))?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 7. Capitalized Single Drug / Chemical / Medical Names
  if (/^[A-Z][a-z]{2,25}$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Helper to unwrap raw JSON session or lesson payloads if an object/JSON was accidentally passed as content string.
 */
export function unwrapJsonContent(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("{") && (trimmed.includes('"contentMarkdown"') || trimmed.includes('"kind"'))) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && (trimmed.includes("\\n") || trimmed.includes('\\"')))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return unwrapJsonContent(parsed);
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
      const match = trimmed.match(/"contentMarkdown"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"citationChunkIds"|"\s*,\s*"kind"|"\s*}|"$)/);
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
  return raw;
}

/**
 * Normalizes rich content before parsing:
 * Unwraps JSON, fixes LaTeX delimiters, converts legacy commands, protects dollars.
 */
export function normalizeRichContent(text: string): string {
  if (!text) {
    return text;
  }

  // 0. Unwrap raw JSON objects or string literals if passed as content
  let raw = unwrapJsonContent(text);

  // 0.1 Sanitize trailing leaked metadata artifacts & model EOF traces
  raw = raw
    .replace(/```\[EOF\][\s\S]*$/g, "")
    .replace(/,?\s*"citationChunkIds"\s*:\s*\[[\s\S]*?\]\s*}?$/s, "")
    .replace(/,?\s*"kind"\s*:\s*"[^"]*"\s*}?$/s, "")
    .replace(
      /(?:\n|^)\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*)+$/s,
      "",
    )
    .trimEnd();

  // 0.2 Fix keyboard typos (e.g. Persian layout '---j' -> '---')
  raw = raw.replace(/^---j$/gm, "---");

  // Split content by code blocks
  const parts = raw.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  const formulaMap: Record<string, string> = {
    IDH1: "IDH1",
    IDH2: "IDH2",
    FLT3: "FLT3",
    BRCA: "BRCA",
    BRCA1: "BRCA1",
    BRCA2: "BRCA2",
    "ER-\\alpha": "ER-α",
    "TNF-\\alpha": "TNF-α",
    "\\beta_2": "$\\beta_2$",
    "HCO3^-": "$\\text{HCO}_3^-$",
    "Cl^-": "$\\text{Cl}^-$",
    "NH4^+": "$\\text{NH}_4^+$",
    "Na+": "$\\text{Na}^+$",
    "K+": "$\\text{K}^+$",
    "H+": "$\\text{H}^+$",
    "H2": "$\\text{H}_2$",
    "CO2 + H2O <=> H2CO3 <=> H+ + HCO3^-":
      "$\\text{CO}_2 + \\text{H}_2\\text{O} \\rightleftharpoons \\text{H}_2\\text{CO}_3 \\rightleftharpoons \\text{H}^+ + \\text{HCO}_3^-$",
  };

  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        if (part.startsWith("`") && !part.startsWith("```") && part.endsWith("`")) {
          const inner = part.slice(1, -1);
          if (isScientificToken(inner)) {
            return inner;
          }
        }
        if (
          part.startsWith("```") &&
          /```(?:chemical|smiles|reaction|rxn|chemical-reaction|chart|charts|chart-json)/i.test(part) &&
          (part.includes("\\n") || part.includes("\\r\\n"))
        ) {
          return part.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
        }
        return part;
      }

      let processed = part;

      if (processed.includes("\\[")) {
        processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_match, equation) => {
          return `$$${equation}$$`;
        });
      }

      if (processed.includes("\\(")) {
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_match, equation) => {
          return `$${equation}$`;
        });
      }

      processed = processed.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathBlock) => {
        let math = mathBlock
          .replace(/\\?text\{/g, "\\text{")
          .replace(/\text\{/g, "\\text{")
          .replace(/\t\s*ext\{/g, "\\text{");
        math = math.replace(/\\-\s*/g, " ");
        return math;
      });

      processed = processed.replace(
        /(^|[^\\])((?<!\\)\$[^$\n]+(?<!\\)\$)\)(?!\))/g,
        (fullMatch, prefix, mathBlock, offset, fullStr) => {
          const openInMath = (mathBlock.match(/\(/g) || []).length;
          const closeInMath = (mathBlock.match(/\)/g) || []).length;
          if (openInMath === closeInMath && openInMath > 0) {
            const beforeText = fullStr.slice(0, offset + prefix.length);
            const lastNewline = beforeText.lastIndexOf("\n");
            const lineBefore =
              lastNewline >= 0 ? beforeText.slice(lastNewline + 1) : beforeText;
            const openBefore = (lineBefore.match(/\(/g) || []).length;
            const closeBefore = (lineBefore.match(/\)/g) || []).length;
            if (openBefore <= closeBefore) {
              return `${prefix}${mathBlock}`;
            }
          }
          return fullMatch;
        },
      );

      processed = processed.replace(
        /(?<!\\)\$(\d+(?:[.,]\d+)*(?:\s*(?:k|K|M|B|USD|EUR|تومان|ریال|هزار|میلیون))?)(?!\.?\d)(?=[.,؛!؟\s]|$)/g,
        (fullMatch, amount, offset, fullStr) => {
          const afterIdx = offset + fullMatch.length;
          if (fullStr[afterIdx] === "$") {
            return fullMatch;
          }
          const restOfLine = fullStr.slice(afterIdx);
          const nextNewline = restOfLine.indexOf("\n");
          const lineRest = nextNewline >= 0 ? restOfLine.slice(0, nextNewline) : restOfLine;
          const closingDollarIdx = lineRest.indexOf("$");

          if (closingDollarIdx !== -1) {
            const between = lineRest.slice(0, closingDollarIdx);
            if (/[-=+*/\\^_{}<>~×≤≥±a-zA-Z]/.test(between)) {
              return fullMatch;
            }
          }

          return `\\$${amount}`;
        },
      );

      const mathSplit = processed.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
      processed = mathSplit
        .map((segment, segIdx) => {
          if (segIdx % 2 === 1) return segment;

          let seg = segment;
          seg = seg.replace(/\\newline\b/g, "\n");
          seg = seg.replace(/\\r\\n/g, "\n");
          seg = seg.replace(/\\n(?!(?:nu|nabla|neq|natural|nearrow|nwarrow|ni)\b)/g, "\n");
          seg = seg.replace(/\\"/g, '"');
          seg = seg
            .replace(/\\?text\{([^{}\n]+)\}/g, "$1")
            .replace(/(?:\b|\t)ext\{([^{}\n]+)\}/g, "$1");
          seg = seg.replace(/\\t(?!(?:ext|au|heta|imes)\b)/g, " ");

          seg = seg.replace(/\\ce\{([^{}]+)\}/g, (m, formula) => {
            const trimmed = formula.trim().replace(/\\\\/g, "\\");
            if (formulaMap[trimmed]) {
              return formulaMap[trimmed];
            }
            if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
              return trimmed;
            }
            return m;
          });

          seg = seg
            .replace(/\\(?:rightarrow|to|longrightarrow)\b/g, "→")
            .replace(/\\(?:leftarrow|gets|longleftarrow)\b/g, "←")
            .replace(/\\leftrightarrow\b/g, "↔")
            .replace(/\\Rightarrow\b/g, "⇒")
            .replace(/\\Leftarrow\b/g, "⇐")
            .replace(/\\Leftrightarrow\b/g, "⇔")
            .replace(/\\(?:rightleftharpoons|leftharpoons)\b/g, "⇌")
            .replace(/\\uparrow\b/g, "↑")
            .replace(/\\downarrow\b/g, "↓")
            .replace(/\\times\b/g, "×")
            .replace(/\\(?:leq|le)\b/g, "≤")
            .replace(/\\(?:geq|ge)\b/g, "≥")
            .replace(/\\pm\b/g, "±")
            .replace(/\\alpha\b/g, "α")
            .replace(/\\beta\b/g, "β")
            .replace(/\\gamma\b/g, "γ")
            .replace(/\\delta\b/g, "δ")
            .replace(/\\mu\b/g, "µ")
            .replace(/\\circ\b/g, "°")
            .replace(/\\approx\b/g, "≈")
            .replace(/\\neq\b/g, "≠");

          return seg;
        })
        .join("");

      return normalizeMarkdownTables(processed);
    })
    .join("");
}

/**
 * Normalizes markdown tables where LLM output may have a mismatch between the number of columns
 * in the header row and delimiter row.
 */
export function normalizeMarkdownTables(content: string): string {
  if (!content.includes("|")) return content;
  const lines = content.split("\n");
  const delimRegex = /^[ \t]*\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*$/;

  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (cur.includes("|") && delimRegex.test(next)) {
      const headerCols = cur.split("|").slice(1, -1).map((c) => c.trim());
      const delimCols = next.split("|").slice(1, -1).map((c) => c.trim());
      if (headerCols.length > 0 && delimCols.length !== headerCols.length) {
        const normalizedDelim =
          "| " + headerCols.map((_, idx) => delimCols[idx] || "---").join(" | ") + " |";
        lines[i + 1] = normalizedDelim;
      }
    }
  }
  return lines.join("\n");
}
