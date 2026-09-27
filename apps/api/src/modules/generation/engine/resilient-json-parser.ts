import { DomainError } from "@avana/domain";

/**
 * Safely unescapes raw string content extracted via regex fallback without corrupting LaTeX commands.
 * Distinguishes JSON escape sequences (\", \n, \r\n) from LaTeX backslash commands (\text, \right, \nabla, etc.).
 *
 * In LaTeX math mode ($...$, $$...$$, \(...\), \[...\]), backslashes are preserved for all LaTeX commands
 * (including arbitrary/custom commands like \newcommand, \notin, \operatorname, etc.).
 * In regular Markdown text outside math mode, JSON escapes (\n, \t, \", \r\n, \\) are safely decoded.
 */
export function safeUnescapeMarkdown(raw: string): string {
  if (!raw) return "";

  // 1. Unescape escaped double quotes (\") -> "
  let text = raw.replace(/\\"/g, '"');

  // 2. Temporarily protect double backslashes (\\\\ -> placeholder) so that LaTeX \\\\ linebreaks and literal backslashes are preserved
  const BS_PLACEHOLDER = "\uE000";
  text = text.replace(/\\\\/g, BS_PLACEHOLDER);

  // 3. Normalize escaped \\r\\n to \n
  text = text.replace(/\\r\\n/g, "\n");

  // 4. Handle single-escaped newlines (\n):
  // Convert \n to real newline unless it is part of a standard LaTeX command starting with \n
  text = text.replace(
    /\\n(?!(?:abla|eq|u\b|otin|ull|atural|earrow|warrow|oindent|eg\b|ewline\b|ewcommand|ewenvironment|ame|operatorname|overline|underline)(?![a-zA-Z]))/g,
    "\n",
  );

  // 5. Handle single-escaped \r:
  // In Markdown, convert \r to \n unless it is a LaTeX command starting with \r (\right, \rho, \rightarrow, \rtau, etc.)
  text = text.replace(/\\r(?![a-zA-Z])/g, "\n");

  // 6. Handle single-escaped \t:
  // Convert \t to tab unless it is a LaTeX command starting with \t (\text, \times, \theta, \tau, \tan, etc.)
  text = text.replace(/\\t(?![a-zA-Z])/g, "\t");

  // 7. Restore double backslashes to single backslash
  text = text.replace(new RegExp(BS_PLACEHOLDER, "g"), "\\");

  return text;
}

/**
 * Parse and validate model JSON output with multi-stage recovery.
 */
export function cleanAndParseJson<T>(text: string, typeDesc: string): T {
  if (!text || text.trim().length === 0) {
    if (typeDesc.includes("review_summary") || typeDesc.includes("summary")) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_MODEL_JSON: Model returned an empty response for ${typeDesc}`,
      );
    }
    throw new DomainError(
      "unprocessable",
      `Model returned an empty response for ${typeDesc}`,
    );
  }

  let jsonStr = text.trim();
  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    jsonStr = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    const firstBracket = jsonStr.indexOf("[");
    const lastBracket = jsonStr.lastIndexOf("]");

    if (
      firstBracket !== -1 &&
      lastBracket !== -1 &&
      lastBracket > firstBracket &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      jsonStr = jsonStr.slice(firstBracket, lastBracket + 1).trim();
    } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  const normalizeResult = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      if (typeDesc.includes("flashcard")) {
        return { kind: "flashcards_batch", cards: val };
      }
      if (typeDesc.includes("quiz")) {
        return { kind: "quizzes_batch", questions: val };
      }
      if (typeDesc.includes("session")) {
        return { kind: "sessions_batch", sessions: val };
      }
    }
    return val;
  };

  // Helper to safely preserve single-backslash LaTeX commands inside JSON string literals
  // Prevents JSON.parse from converting \t (in \text), \b (in \beta), \f (in \frac), \r (in \rho), \n (in \neq) into control characters
  const sanitizeLatexBackslashesInJson = (raw: string): string => {
    return raw.replace(/"((?:[^"\\]|\\.)*)"/gs, (stringLiteral) => {
      return stringLiteral.replace(
        /(?<!\\)\\(text|textbf|textit|textrm|textsf|texttt|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|ce|pu|equiv|beta|bar|binom|bullet|frac|forall|flat|rho|rightarrow|longrightarrow|to|right|rangle|neq|nabla|nu|not|neg|alpha|gamma|theta|sigma|omega|delta|Delta|mu|lambda|pi|partial|times|le|ge|pm|approx|cdot|infty|sqrt|sum|int|lim|leftarrow|longleftarrow|left|langle|cup|cap|subset|subseteq|in|notin|exists|emptyset|log|ln|sin|cos|tan|cot|sec|csc|rightleftharpoons|uparrow|downarrow)(?![a-zA-Z])/g,
        "\\\\$1",
      );
    });
  };

  const latexSafeJson = sanitizeLatexBackslashesInJson(jsonStr);

  // Attempt 1: Standard JSON parse with LaTeX escape protection
  try {
    const parsed = normalizeResult(JSON.parse(latexSafeJson));
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Continue to cleanup attempts
  }

  // Attempt 2: Remove trailing commas
  try {
    const noTrailingCommas = jsonStr.replace(/,\s*([}\]])/g, "$1");
    const parsed = normalizeResult(JSON.parse(noTrailingCommas));
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Continue
  }

  // Attempt 3: Fix unescaped newlines and tabs inside string literals
  try {
    const escapedStrings = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/"((?:[^"\\]|\\.)*)"/gs, (match) => {
        return match
          .replace(/\r\n/g, "\\n")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\n")
          .replace(/\t/g, "\\t");
      });
    const parsed = normalizeResult(JSON.parse(escapedStrings));
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Continue
  }

  // Attempt 4: Fix unescaped control chars
  try {
    const sanitized = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/"((?:[^"\\]|\\.)*)"/gs, (match) => {
        return match
          .replace(/\r\n/g, "\\n")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\n")
          .replace(/\t/g, "\\t");
      })
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    const parsed = JSON.parse(sanitized);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // Continue
  }

  // Attempt 5: Comprehensive fallback parsing per content type
  if (typeDesc.includes("sessions_batch")) {
    const sessionsMatch = [
      ...jsonStr.matchAll(
        /{\s*"index"\s*:\s*(\d+)[\s\S]*?"title"\s*:\s*"([^"]+)"[\s\S]*?"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*})/g,
      ),
    ];
    if (sessionsMatch.length > 0) {
      const sessions = sessionsMatch.map((m) => ({
        index: parseInt(m[1], 10),
        title: m[2],
        contentMarkdown: safeUnescapeMarkdown(m[3]),
        citationChunkIds: [],
      }));
      return {
        kind: "sessions_batch",
        sessions,
        citationChunkIds: [],
      } as T;
    }
  }

  if (typeDesc.includes("session")) {
    const titleMatch =
      jsonStr.match(/"title"\s*:\s*"([^"]+)"/i) ||
      text.match(/"title"\s*:\s*"([^"]+)"/i);

    let content = "";
    const contentMatch =
      jsonStr.match(
        /"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*,\s*"kind"|\s*})/,
      ) ||
      text.match(
        /"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*,\s*"kind"|\s*})/,
      );
    if (contentMatch && contentMatch[1]) {
      content = contentMatch[1];
    } else {
      const src = jsonStr.includes('"contentMarkdown"') ? jsonStr : text;
      const idx = src.indexOf('"contentMarkdown"');
      if (idx !== -1) {
        const after = src.slice(idx + 17);
        const startQuote = after.indexOf('"');
        if (startQuote !== -1) {
          const rawContent = after.slice(startQuote + 1);
          const endCitation = rawContent.lastIndexOf('"citationChunkIds"');
          if (endCitation !== -1) {
            content = rawContent.slice(0, endCitation).replace(/",?\s*$/, "").trim();
          } else {
            content = rawContent.replace(/"\s*}\s*$/, "").trim();
          }
        }
      }
    }

    // Strip any trailing citationChunkIds / JSON metadata that might have leaked into content string
    content = content
      .replace(/",\s*"citationChunkIds"\s*:\s*\[[\s\S]*\]\s*}?$/s, "")
      .replace(/",\s*"kind"\s*:\s*"[^"]*"\s*}?$/s, "")
      .replace(/"\s*}\s*$/s, "")
      .trim();

    if (!content) {
      throw new DomainError(
        "unprocessable",
        `STAGE2_INVALID_MODEL_JSON: Model returned invalid session JSON without contentMarkdown`,
      );
    }

    const unescaped = safeUnescapeMarkdown(content);

    let citationChunkIds: string[] = [];
    const citMatch =
      jsonStr.match(/"citationChunkIds"\s*:\s*(\[[^\]]*\])/) ||
      text.match(/"citationChunkIds"\s*:\s*(\[[^\]]*\])/);
    if (citMatch && citMatch[1]) {
      try {
        citationChunkIds = JSON.parse(citMatch[1]);
      } catch {
        // ignore
      }
    }

    return {
      kind: "session",
      title: titleMatch ? titleMatch[1] : undefined,
      contentMarkdown: unescaped,
      citationChunkIds,
    } as T;
  }

  if (typeDesc.includes("flashcard")) {
    const cardMatches = [
      ...jsonStr.matchAll(
        /{\s*(?:"sessionIndex"\s*:\s*(\d+)\s*,\s*)?"question"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"explanation"\s*:\s*"([\s\S]*?)")?(?:\s*,\s*"cardType"\s*:\s*"([\s\S]*?)")?(?:\s*,\s*"difficulty"\s*:\s*"([\s\S]*?)")?\s*}/g,
      ),
    ];
    if (cardMatches.length > 0) {
      const cards = cardMatches.map((m) => ({
        sessionIndex: m[1] ? parseInt(m[1], 10) : undefined,
        question: safeUnescapeMarkdown(m[2]),
        answer: safeUnescapeMarkdown(m[3]),
        explanation: m[4] ? safeUnescapeMarkdown(m[4]) : undefined,
        cardType: (m[5] as unknown as "key_fact") || "key_fact",
        difficulty: (m[6] as unknown as "medium") || "medium",
      }));
      return {
        kind: "flashcards_batch",
        cards,
        citationChunkIds: [],
      } as T;
    }
  }

  if (typeDesc.includes("quiz")) {
    const qMatches = [
      ...jsonStr.matchAll(
        /(?:{\s*"sessionIndex"\s*:\s*(\d+)\s*,)?[\s\S]*?"question"\s*:\s*"([^"]+)"[\s\S]*?"choices"\s*:\s*\[([\s\S]*?)\][\s\S]*?"correctAnswer"\s*:\s*"([^"]+)"[\s\S]*?"explanation"\s*:\s*"([^"]+)"/g,
      ),
    ];
    if (qMatches.length > 0) {
      const questions = qMatches.map((m) => {
        const rawChoices = m[3];
        const choices = [...rawChoices.matchAll(/"([^"]+)"/g)].map((c) => c[1]);
        return {
          sessionIndex: m[1] ? parseInt(m[1], 10) : undefined,
          question: m[2],
          questionType: "multiple_choice" as const,
          choices:
            choices.length >= 4
              ? choices
              : [m[4], "گزینه انحرافی ۱", "گزینه انحرافی ۲", "گزینه انحرافی ۳"],
          correctAnswer: m[4],
          explanation: m[5],
        };
      });
      return {
        kind: "quizzes_batch",
        questions,
        citationChunkIds: [],
      } as T;
    }
  }

  if (typeDesc.includes("review_summary") || typeDesc.includes("summary")) {
    throw new DomainError(
      "unprocessable",
      `STAGE5_INVALID_MODEL_JSON: Model returned malformed or unparseable JSON for ${typeDesc}`,
    );
  }

  throw new DomainError(
    "unprocessable",
    `Model returned invalid JSON for ${typeDesc}`,
  );
}
