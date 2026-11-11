import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import ReactDOMServer from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  normalizeRichContent,
  remarkLessonCallouts,
  parseChemicalCodeContent,
  parseReactionCodeContent,
  parseChartCodeContent,
  validateEducationalChart,
  resolveChapterSessionNumbers,
  type CalloutType,
} from "@avana/domain";
import {
  renderSmilesToSvg,
  renderReactionSmilesToSvg,
} from "./chemical-svg-renderer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LessonPdfData {
  title: string;
  courseName?: string;
  moduleTitle?: string;
  reference?: string | null;
  contentMarkdown: string;
  generationDate?: string;
  headerTitle?: string;
  footerSubtitle?: string;
}

export interface ChapterSessionItem {
  id: string;
  title: string;
  sortOrder: number;
  contentMarkdown: string;
  reference?: string | null;
  estimatedMinutes?: number | null;
  sessionNumber?: number | null;
}

export interface ChapterPdfData {
  chapterId: string;
  chapterTitle: string;
  courseName: string;
  chapterReference?: string | null;
  courseReference?: string | null;
  reference?: string | null;
  sessions: ChapterSessionItem[];
  generationDate?: string;
  organizationName?: string;
}

export interface ReviewSummaryComparison {
  title?: string;
  aspects?: string[];
  items?: Record<string, Record<string, string>>;
  headers?: string[];
  rows?: string[][];
}

export interface ReviewSummarySection {
  title?: string;
  keyPoints?: string[];
  mechanisms?: string[];
  classifications?: string[];
  comparisons?: ReviewSummaryComparison[];
  memorizationPoints?: string[];
  examPoints?: string[];
}

export interface ReviewSummaryPdfData {
  title: string;
  courseName?: string;
  moduleTitle?: string;
  estimatedReadingMinutes?: number;
  overview?: string;
  sections?: ReviewSummarySection[];
  finalTakeaways?: string[];
  generationDate?: string;
}

let cachedEstedadFontBase64: string | null = null;
let cachedFontBase64: string | null = null;
let cachedLogoBase64: string | null = null;
let cachedLogoPath: string | null = null;
let cachedLogoMtime = 0;
let cachedKatexCss: string | null = null;

export function getEstedadFontBase64(): string {
  if (cachedEstedadFontBase64) return cachedEstedadFontBase64;
  const candidates = [
    path.resolve(process.cwd(), "apps/web/src/assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].woff2"),
    path.resolve(__dirname, "../../../../../apps/web/src/assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].woff2"),
    path.resolve(__dirname, "../../../../web/src/assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].woff2"),
    path.resolve(__dirname, "../../../../../web/src/assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].woff2"),
    // Also candidate for ttf if woff2 is absent
    path.resolve(process.cwd(), "apps/web/src/assets/fonts/Estedad-v5.0-Fontjo.com/Estedad[wght,kshd].ttf"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedEstedadFontBase64 = fs.readFileSync(p).toString("base64");
      return cachedEstedadFontBase64;
    }
  }

  const errorMsg = `[PDF Generation] ERROR: Primary font Estedad (Estedad[wght,kshd].woff2) not found across paths: ${candidates.join(", ")}`;
  // eslint-disable-next-line no-console
  console.error(errorMsg);

  // Fallback to Vazirmatn if available in node_modules
  const fallback = getVazirmatnFontBase64();
  if (fallback) {
    // eslint-disable-next-line no-console
    console.warn("[PDF Generation] Falling back to secondary font (Vazirmatn).");
    return fallback;
  }
  throw new Error(errorMsg);
}

export function getVazirmatnFontBase64(): string {
  if (cachedFontBase64) return cachedFontBase64;
  const candidates = [
    path.resolve(__dirname, "../../../../../../node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"),
    path.resolve(process.cwd(), "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedFontBase64 = fs.readFileSync(p).toString("base64");
      return cachedFontBase64;
    }
  }
  return "";
}

export function getAvanaLogoBase64(): string {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/public/brand/avana-logo.png"),
    path.resolve(process.cwd(), "../web/public/brand/avana-logo.png"),
    path.resolve(process.cwd(), "web/public/brand/avana-logo.png"),
    path.resolve(__dirname, "../../../../web/public/brand/avana-logo.png"),
    path.resolve(__dirname, "../../../../../apps/web/public/brand/avana-logo.png"),
    path.resolve(__dirname, "../../../web/public/brand/avana-logo.png"),
    path.resolve(__dirname, "../../../../apps/web/public/brand/avana-logo.png"),
  ];

  let resolvedPath: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      resolvedPath = p;
      break;
    }
  }

  if (!resolvedPath) {
    // eslint-disable-next-line no-console
    console.error(`[PDF Generation] ERROR: Avana brand logo (avana-logo.png) not found across candidate paths: ${candidates.join(", ")}`);
    return "";
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (cachedLogoBase64 && cachedLogoPath === resolvedPath && cachedLogoMtime === stat.mtimeMs) {
      return cachedLogoBase64;
    }
    cachedLogoBase64 = fs.readFileSync(resolvedPath).toString("base64");
    cachedLogoPath = resolvedPath;
    cachedLogoMtime = stat.mtimeMs;
    return cachedLogoBase64;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[PDF Generation] ERROR: Failed reading logo file at ${resolvedPath}:`, err);
    return "";
  }
}

export function getInlinedKatexCss(): string {
  if (cachedKatexCss) return cachedKatexCss;
  try {
    const candidates = [
      path.resolve(process.cwd(), "node_modules/katex/dist/katex.min.css"),
      path.resolve(__dirname, "../../../../../../node_modules/katex/dist/katex.min.css"),
    ];
    let resolvedCssPath: string | null = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        resolvedCssPath = p;
        break;
      }
    }

    if (!resolvedCssPath) return "";

    const fontsDir = path.resolve(path.dirname(resolvedCssPath), "fonts");
    let css = fs.readFileSync(resolvedCssPath, "utf-8");

    // Replace fonts with inline base64 data URIs
    css = css.replace(/src:\s*url\((['"]?)fonts\/([^)'"]+\.woff2)\1\)[^;]+;/g, (_m, _q, filename) => {
      const fontFile = path.join(fontsDir, filename);
      if (fs.existsSync(fontFile)) {
        const b64 = fs.readFileSync(fontFile).toString("base64");
        return `src: url("data:font/woff2;base64,${b64}") format("woff2");`;
      }
      return _m;
    });

    cachedKatexCss = css;
    return cachedKatexCss;
  } catch {
    return "";
  }
}

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  const s = typeof str === "string" ? str : String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHref(href?: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Validates whether a reference string represents a genuine academic source citation
 * (e.g. "Guyton Physiology, Ch 5", "کاتزونگ ۲۰۲۴") rather than an internal file name,
 * uploaded artifact, document ID, URL, or placeholder string.
 */
export function isValidAcademicReference(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== "string") return false;
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;

  const lower = trimmed.toLowerCase();

  // 1. Reject synthetic placeholders
  const placeholders = [
    "بدون مرجع",
    "نامشخص",
    "تعریف نشده",
    "ندارد",
    "ثبت نشده",
    "بدون رفرنس",
    "null",
    "undefined",
    "none",
    "n/a",
    "-",
    "--",
  ];
  if (placeholders.includes(lower)) return false;

  // 2. Reject file names with extensions (e.g. 40.pdf, lecture.docx, file.txt)
  if (/\.(pdf|docx?|pptx?|xlsx?|txt|md|epub|rtf|zip|csv|json|png|jpe?g|webp)$/i.test(trimmed)) {
    return false;
  }

  // 3. Reject file paths or URIs
  if (/^(?:file:\/\/|\/|[a-zA-Z]:[\\/]|https?:\/\/)/i.test(trimmed)) {
    return false;
  }

  // 4. Reject document UUIDs or internal artifact IDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false;
  }
  if (/^(?:doc|file|upload|document|chunk|sess)[-_][0-9a-zA-Z_-]+$/i.test(trimmed)) {
    return false;
  }

  return true;
}

function formatChemicalFormulaHtml(formula: string): string {
  if (!formula) return "";
  const safe = formula
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return safe.replace(/([A-Z][a-z]?)(_?\{?(\d+)\}?)/g, "$1<sub>$3</sub>");
}

function formatChemicalEquationHtml(equation: string): string {
  if (!equation) return "";
  const withArrow = equation.replace(/-->|->/g, " ⟶ ");
  const safe = withArrow
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return safe.replace(/([A-Z][a-z]?)(_?\{?(\d+)\}?)/g, "$1<sub>$3</sub>");
}

/**
 * Converts ASCII English numerals (0-9) to Persian numerals (۰-۹).
 * Used strictly for presentation in badges, metadata, and dates without altering data models.
 */
export function toPersianDigits(num: number | string | undefined | null): string {
  if (num === null || num === undefined) return "";
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(num).replace(/\d/g, (d) => persianDigits[parseInt(d, 10)]);
}

/**
 * Safely removes a leading markdown heading (# or ##) from session content if and only if
 * it is an exact duplicate of the session title already rendered in the session header box.
 * Preserves all surrounding and subsequent educational content without guesswork.
 */
export function stripDuplicateLeadingHeading(markdown: string, sessionTitle?: string): string {
  if (!markdown || typeof markdown !== "string" || !sessionTitle) return markdown;
  const trimmed = markdown.trim();
  const match = /^#{1,3}\s+(.+)$/m.exec(trimmed);
  if (!match || match.index !== 0) {
    return markdown;
  }
  const headingText = match[1].trim();
  const cleanTitle = sessionTitle.trim();

  // Strip session prefix ("جلسه X: ") to test equivalence
  const titleWithoutPrefix = cleanTitle.replace(/^جلسه\s*[\d۰-۹]+[:\-–—\s]*/i, "").trim();
  const headingWithoutPrefix = headingText.replace(/^جلسه\s*[\d۰-۹]+[:\-–—\s]*/i, "").trim();

  const isExactDuplicate =
    headingText === cleanTitle ||
    (titleWithoutPrefix.length > 2 && headingWithoutPrefix === titleWithoutPrefix);

  if (isExactDuplicate) {
    return trimmed.slice(match[0].length).trimStart();
  }
  return markdown;
}

/**
 * Strips repetitive session prefixes like "جلسه ۱:", "جلسه 1 -", "جلسه سوم:", etc.
 * from a session title so that the session number is cleanly represented by the square badge.
 */
export function stripSessionTitlePrefix(title: string | null | undefined): string {
  if (!title || typeof title !== "string") return "";
  const trimmed = title.trim();
  const cleaned = trimmed.replace(
    /^جلسه\s*(?:[\d\u06F0-\u06F9]+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم|[IVXLCDMivxlcdm]+)\s*[:\-ـ–—\s]\s*/i,
    "",
  ).trim();
  return cleaned || trimmed;
}

interface CalloutTheme {
  titleColor: string;
  bgColor: string;
  borderColor: string;
  iconSvg: string;
}

const CALLOUT_THEMES: Record<CalloutType, CalloutTheme> = {
  warning: {
    titleColor: "#d97706",
    bgColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "#f59e0b",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
  "common-mistake": {
    titleColor: "#e11d48",
    bgColor: "rgba(244, 63, 94, 0.08)",
    borderColor: "#f43f5e",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
  important: {
    titleColor: "#7c3aed",
    bgColor: "rgba(139, 92, 246, 0.08)",
    borderColor: "#8b5cf6",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  },
  tip: {
    titleColor: "#d97706",
    bgColor: "rgba(245, 158, 11, 0.07)",
    borderColor: "#f59e0b",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  },
  "educational-tip": {
    titleColor: "#d97706",
    bgColor: "rgba(245, 158, 11, 0.07)",
    borderColor: "#f59e0b",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  },
  "clinical-point": {
    titleColor: "#059669",
    bgColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "#10b981",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`,
  },
  "drug-application": {
    titleColor: "#0284c7",
    bgColor: "rgba(14, 165, 233, 0.08)",
    borderColor: "#0ea5e9",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
  },
  contraindication: {
    titleColor: "#dc2626",
    bgColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "#ef4444",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`,
  },
  "key-point": {
    titleColor: "#0f766e",
    bgColor: "rgba(13, 148, 136, 0.08)",
    borderColor: "#0d9488",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  },
  understanding: {
    titleColor: "#0284c7",
    bgColor: "rgba(2, 132, 199, 0.08)",
    borderColor: "#0284c7",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z"/></svg>`,
  },
  supplementary: {
    titleColor: "#4f46e5",
    bgColor: "rgba(99, 102, 241, 0.08)",
    borderColor: "#6366f1",
    iconSvg: `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  },
};

/**
 * Renders rich educational markdown into high-fidelity, print-optimized HTML.
 * Supports: GFM tables, KaTeX math, AVANA 11 callouts, chemical structures, charts, lists, and safe HTML.
 */
export function markdownToSafeHtml(markdown: string): string {
  if (!markdown || typeof markdown !== "string") return "";

  // 1. Run canonical domain normalization (fixes JSON, math delimiters, tab corruption, etc.)
  let normalized = normalizeRichContent(markdown);
  // Sanitize non-printable encoding artifacts: soft hyphen (\u00AD), BOM (\uFEFF), replacement char (\uFFFD)
  normalized = normalized.replace(/[\u00AD\uFEFF\uFFFD]/g, "");
  // Normalize standalone single-line $$ math $$ into multiline display math blocks
  normalized = normalized.replace(/^([ \t]*)\$\$(?!\$)([^\n]+?)\$\$([ \t]*)$/gm, "$1$$$$\n$2\n$$$$$3");
  // Remove decorative divider lines (---) immediately preceding section headings
  normalized = normalized.replace(/^([ \t]*---[ \t]*\n+)+(?=[ \t]*#{1,6}\s)/gm, "");

  // 2. Render ReactMarkdown tree into static HTML string with custom print components
  const remarkPlugins: any[] = [remarkGfm, remarkMath, remarkLessonCallouts];
  const rehypePlugins: any[] = [[rehypeKatex, { throwOnError: false, strict: false }]];

  const element = React.createElement(ReactMarkdown as any, {
    remarkPlugins,
    rehypePlugins,
    components: {
      callout: ({ type, title, children }: { type?: CalloutType; title?: string; children?: React.ReactNode }) => {
        const theme = CALLOUT_THEMES[type || "tip"] || CALLOUT_THEMES.tip;
        const displayTitle = title || "نکته آموزشی";
        return React.createElement(
          "div",
          {
            className: `callout callout-${type || "tip"}`,
            style: {
              borderRightColor: theme.borderColor,
              backgroundColor: theme.bgColor,
            },
          },
          [
            React.createElement(
              "div",
              {
                className: "callout-header",
                style: { color: theme.titleColor },
                key: "header",
              },
              [
                React.createElement("span", {
                  className: "callout-icon-wrap",
                  dangerouslySetInnerHTML: { __html: theme.iconSvg },
                  key: "icon",
                }),
                React.createElement("span", { className: "callout-title", key: "title" }, displayTitle),
              ],
            ),
            React.createElement("div", { className: "callout-content", key: "content" }, children),
          ],
        );
      },
      h1: ({ children, node, ...props }: any) => React.createElement("h1", { className: "content-h1", ...props }, children),
      h2: ({ children, node, ...props }: any) => React.createElement("h2", { className: "content-h2", ...props }, children),
      h3: ({ children, node, ...props }: any) => React.createElement("h3", { className: "content-h3", ...props }, children),
      h4: ({ children, node, ...props }: any) => React.createElement("h4", { className: "content-h4", ...props }, children),
      p: ({ children, node, ...props }: any) => React.createElement("p", { className: "content-p", ...props }, children),
      ul: ({ children, node, ...props }: any) => React.createElement("ul", { className: "content-ul", ...props }, children),
      ol: ({ children, node, ...props }: any) => React.createElement("ol", { className: "content-ol", ...props }, children),
      li: ({ children, node, ...props }: any) => React.createElement("li", { className: "content-li", ...props }, children),
      table: ({ children, node, ...props }: any) =>
        React.createElement(
          "div",
          { className: "table-container", dir: "rtl" },
          React.createElement("table", { className: "content-table", dir: "rtl", ...props }, children),
        ),
      thead: ({ children, node: _node, ...props }: any) => React.createElement("thead", { dir: "rtl", ...props }, children),
      tbody: ({ children, node: _node, ...props }: any) => React.createElement("tbody", { dir: "rtl", ...props }, children),
      tr: ({ children, node: _node, ...props }: any) => React.createElement("tr", { dir: "rtl", ...props }, children),
      th: ({ children, node: _node, style, ...props }: any) => {
        const explicitAlign = style?.textAlign;
        const resolvedAlign =
          explicitAlign === "center"
            ? "center"
            : explicitAlign === "right"
            ? "right"
            : "right";

        return React.createElement(
          "th",
          {
            ...props,
            dir: props.dir === "ltr" ? "ltr" : "rtl",
            style: { ...style, textAlign: resolvedAlign },
          },
          children,
        );
      },
      td: ({ children, node: _node, style, ...props }: any) => {
        const explicitAlign = style?.textAlign;
        const resolvedAlign =
          explicitAlign === "center"
            ? "center"
            : explicitAlign === "right"
            ? "right"
            : "right";

        return React.createElement(
          "td",
          {
            ...props,
            dir: props.dir === "ltr" ? "ltr" : "rtl",
            style: { ...style, textAlign: resolvedAlign },
          },
          children,
        );
      },
      blockquote: ({ children, node, ...props }: any) => React.createElement("blockquote", { className: "content-blockquote", ...props }, children),
      hr: ({ node, ...props }: any) => React.createElement("hr", { className: "content-hr", ...props }),
      img: ({ alt, src, ...props }: any) => {
        if (!src) return null;
        return React.createElement("figure", { className: "content-figure" }, [
          React.createElement("img", {
            className: "content-img",
            src,
            alt: alt || "تصویر آموزشی",
            key: "img",
            ...props,
          }),
          alt ? React.createElement("figcaption", { key: "cap" }, alt) : null,
        ]);
      },
      a: ({ children, href, ...props }: any) =>
        React.createElement(
          "a",
          {
            className: "content-link",
            href: isSafeHref(href) ? href : "#",
            target: "_blank",
            rel: "noreferrer noopener",
            ...props,
          },
          children,
        ),
      pre: ({ children, ...props }: any) => {
        // If child is a chemical, reaction or chart code block, unwrap outer <pre>
        if (React.isValidElement<{ className?: string }>(children)) {
          const cls = children.props?.className || "";
          if (
            cls.includes("language-chemical") ||
            cls.includes("language-smiles") ||
            cls.includes("language-reaction") ||
            cls.includes("language-rxn") ||
            cls.includes("language-chemical-reaction") ||
            cls.includes("language-chart") ||
            cls.includes("language-charts")
          ) {
            return children;
          }
        }
        return React.createElement("pre", { className: "content-code-block", dir: "ltr", ...props }, children);
      },
      code: ({ children, className, ...props }: any) => {
        const match = /language-([a-zA-Z0-9_-]+)/.exec(className || "");
        const lang = match ? match[1].toLowerCase() : "";
        const rawContent =
          typeof children === "string"
            ? children
            : Array.isArray(children)
            ? children.map((c) => (typeof c === "string" ? c : "")).join("")
            : "";

        // 1. Chemical Structure block
        if (lang === "chemical" || lang === "smiles") {
          const parsedStructure = parseChemicalCodeContent(rawContent, lang);
          if (parsedStructure) {
            const svgString = parsedStructure.smiles
              ? renderSmilesToSvg(parsedStructure.smiles, { width: 500, height: 260 })
              : null;

            return React.createElement("div", { className: "academic-chem-card", dir: "rtl" }, [
              React.createElement("div", { className: "chem-header", key: "ch-hdr" }, [
                React.createElement("div", { className: "chem-title-wrap", key: "ch-title" }, [
                  React.createElement("span", {
                    className: "chem-icon",
                    dangerouslySetInnerHTML: {
                      __html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></svg>`,
                    },
                    key: "icn",
                  }),
                  React.createElement("span", { className: "chem-title", key: "t" }, parsedStructure.compoundName || "ساختار مولکولی"),
                ]),
                React.createElement("span", { className: "chem-badge", key: "b" }, "ساختار ۲بعدی دارویی"),
              ]),
              React.createElement("div", { className: "chem-body", key: "ch-body" }, [
                // Real 2D SVG molecular structure drawing
                svgString
                  ? React.createElement("div", {
                      className: "chem-structure-viewport",
                      dir: "ltr",
                      dangerouslySetInnerHTML: { __html: svgString },
                      key: "svg-vp",
                    })
                  : parsedStructure.smiles
                  ? React.createElement("div", { className: "chem-fallback-notice", key: "fallback-note" }, [
                      React.createElement("span", { className: "chem-label", key: "fl" }, "کد ساختار:"),
                      React.createElement("code", { className: "chem-smiles-code", dir: "ltr", key: "fc" }, parsedStructure.smiles),
                    ])
                  : null,
                // Chemical metadata bar
                React.createElement(
                  "div",
                  { className: "chem-meta-bar", key: "ch-meta" },
                  [
                    parsedStructure.formula
                      ? React.createElement("div", { className: "chem-field", key: "f" }, [
                          React.createElement("span", { className: "chem-label", key: "l" }, "فرمول مولکولی:"),
                          React.createElement("span", {
                            className: "chem-formula",
                            dir: "ltr",
                            dangerouslySetInnerHTML: { __html: formatChemicalFormulaHtml(parsedStructure.formula) },
                            key: "v",
                          }),
                        ])
                      : null,
                    parsedStructure.molecularWeight
                      ? React.createElement("div", { className: "chem-field", key: "mw" }, [
                          React.createElement("span", { className: "chem-label", key: "l" }, "جرم مولی:"),
                          React.createElement("span", { className: "chem-value", dir: "ltr", key: "v" }, `${parsedStructure.molecularWeight} g/mol`),
                        ])
                      : null,
                    parsedStructure.smiles && svgString
                      ? React.createElement("div", { className: "chem-field chem-smiles-badge-field", key: "s-badge" }, [
                          React.createElement("span", { className: "chem-label", key: "sl" }, "SMILES:"),
                          React.createElement("code", { className: "chem-smiles-badge", dir: "ltr", key: "sc" }, parsedStructure.smiles),
                        ])
                      : null,
                  ].filter(Boolean),
                ),
                parsedStructure.sarHighlights && parsedStructure.sarHighlights.length > 0
                  ? React.createElement("div", { className: "chem-sar-box", key: "sar" }, [
                      React.createElement("div", { className: "chem-sar-title", key: "st" }, "روابط ساختار-فعالیت (SAR):"),
                      React.createElement(
                        "ul",
                        { className: "content-ul", key: "sul" },
                        parsedStructure.sarHighlights.map((s, idx) => {
                          const label = s.feature && s.feature !== "feature" ? s.feature : "";
                          const desc = s.description || (s as any).pharmacophoreRole || (s as any).text || "";
                          return React.createElement(
                            "li",
                            { key: idx },
                            label
                              ? React.createElement("span", null, [
                                  React.createElement("strong", { key: "f", style: { color: "#0f766e" } }, `${label}: `),
                                  React.createElement("span", { key: "d" }, desc),
                                ])
                              : desc,
                          );
                        }),
                      ),
                    ])
                  : null,
              ].filter(Boolean)),
            ]);
          }
        }

        // 2. Reaction block
        if (lang === "reaction" || lang === "rxn" || lang === "chemical-reaction") {
          const parsedReaction = parseReactionCodeContent(rawContent, lang);
          if (parsedReaction) {
            // Check if reaction can be rendered as 2D SVG scheme
            let rxnSvg: string | null = null;
            if (rawContent.includes(">")) {
              rxnSvg = renderReactionSmilesToSvg(rawContent.trim());
            }

            const reactantsWithSmiles =
              parsedReaction.reactants?.filter((r: any) => r && r.smiles && renderSmilesToSvg(r.smiles)) || [];
            const productsWithSmiles =
              parsedReaction.products?.filter((p: any) => p && p.smiles && renderSmilesToSvg(p.smiles)) || [];
            const hasParticipantSmiles = reactantsWithSmiles.length > 0 && productsWithSmiles.length > 0;

            if (!rxnSvg && hasParticipantSmiles) {
              const combinedSmiles =
                parsedReaction.reactants.map((r: any) => r.smiles).join(".") +
                ">>" +
                parsedReaction.products.map((p: any) => p.smiles).join(".");
              rxnSvg = renderReactionSmilesToSvg(combinedSmiles);
            }

            return React.createElement("div", { className: "academic-chem-card", dir: "rtl" }, [
              React.createElement("div", { className: "chem-header", key: "rxn-hdr" }, [
                React.createElement("span", { className: "chem-title", key: "t" }, parsedReaction.title || "واکنش شیمیایی"),
                React.createElement("span", { className: "chem-badge", key: "b" }, "معادله واکنش ۲بعدی"),
              ]),
              React.createElement("div", { className: "chem-body", key: "rxn-body" }, [
                rxnSvg
                  ? React.createElement("div", {
                      className: "reaction-scheme-viewport",
                      dir: "ltr",
                      dangerouslySetInnerHTML: { __html: rxnSvg },
                      key: "rxn-svg",
                    })
                  : hasParticipantSmiles
                  ? React.createElement("div", { className: "reaction-participants-row", dir: "ltr", key: "rxn-pts" }, [
                      // Reactants
                      ...reactantsWithSmiles.flatMap((r: any, idx: number) => {
                        const rSvg = renderSmilesToSvg(r.smiles, { width: 140, height: 90 });
                        const item = React.createElement(
                          "div",
                          { className: "reaction-participant-item", key: `r-${idx}` },
                          [
                            rSvg ? React.createElement("div", { dangerouslySetInnerHTML: { __html: rSvg }, key: "isvg" }) : null,
                            r.name ? React.createElement("span", { className: "reaction-participant-name", key: "in" }, r.name) : null,
                          ].filter(Boolean),
                        );
                        return idx > 0 ? [React.createElement("span", { className: "reaction-symbol", key: `r-plus-${idx}` }, "+"), item] : [item];
                      }),
                      // Arrow with conditions
                      React.createElement(
                        "div",
                        { className: "reaction-symbol", key: "rxn-arrow" },
                        [
                          parsedReaction.reagents && parsedReaction.reagents.length > 0
                            ? React.createElement("span", { className: "reaction-reagent-label", key: "rg" }, parsedReaction.reagents.join(", "))
                            : null,
                          React.createElement("span", { key: "arr" }, "⟶"),
                        ].filter(Boolean),
                      ),
                      // Products
                      ...productsWithSmiles.flatMap((p: any, idx: number) => {
                        const pSvg = renderSmilesToSvg(p.smiles, { width: 140, height: 90 });
                        const item = React.createElement(
                          "div",
                          { className: "reaction-participant-item", key: `p-${idx}` },
                          [
                            pSvg ? React.createElement("div", { dangerouslySetInnerHTML: { __html: pSvg }, key: "jsvg" }) : null,
                            p.name ? React.createElement("span", { className: "reaction-participant-name", key: "jn" }, p.name) : null,
                          ].filter(Boolean),
                        );
                        return idx > 0 ? [React.createElement("span", { className: "reaction-symbol", key: `p-plus-${idx}` }, "+"), item] : [item];
                      }),
                    ])
                  : React.createElement("div", { className: "chem-field", key: "raw-rxn" }, [
                      React.createElement("div", {
                        className: "reaction-equation-text",
                        dir: "ltr",
                        dangerouslySetInnerHTML: { __html: formatChemicalEquationHtml(rawContent.trim()) },
                      }),
                    ]),
              ].filter(Boolean)),
            ]);
          }
        }

        // 3. Chart block
        if (lang === "chart" || lang === "charts" || lang === "chart-json") {
          const parsedChart = parseChartCodeContent(rawContent, lang);
          if (parsedChart) {
            const validation = validateEducationalChart(parsedChart);
            if (validation.valid && validation.chart) {
              const c = validation.chart;
              return React.createElement("div", { className: "academic-chart-card", dir: "rtl" }, [
                React.createElement("div", { className: "chart-header", key: "h" }, [
                  React.createElement("span", { className: "chart-title", key: "t" }, c.title),
                  React.createElement("span", { className: "chart-badge", key: "b" }, c.type.toUpperCase()),
                ]),
                c.data && c.data.length > 0
                  ? React.createElement("div", { className: "chart-table-wrap", key: "tw" }, [
                      React.createElement("table", { className: "content-table", key: "tbl" }, [
                        React.createElement("thead", { key: "th" }, [
                          React.createElement("tr", { key: "tr" }, [
                            React.createElement("th", { key: "lbl" }, "شاخص / برچسب"),
                            React.createElement("th", { key: "val" }, "مقدار"),
                          ]),
                        ]),
                        React.createElement(
                          "tbody",
                          { key: "tb" },
                          c.data.map((item, idx) =>
                            React.createElement("tr", { key: idx }, [
                              React.createElement("td", { key: "l" }, item.label),
                              React.createElement("td", { key: "v", dir: "ltr" }, String(item.value)),
                            ]),
                          ),
                        ),
                      ]),
                    ])
                  : null,
              ]);
            }
          }
        }

        // Standard inline/block code
        return React.createElement(
          "code",
          {
            className: `content-code ${className || ""}`.trim(),
            dir: "ltr",
            ...props,
          },
          children,
        );
      },
    },
    children: normalized,
  });

  return ReactDOMServer.renderToStaticMarkup(element);
}

function getBaseStyles(fontBase64: string, katexCss: string): string {
  return `
    @font-face {
      font-family: 'Estedad';
      src:
        url('data:font/woff2;base64,${fontBase64}') format('woff2-supports-variations'),
        url('data:font/woff2;base64,${fontBase64}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }

    ${katexCss}

    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Estedad', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 10pt;
      line-height: 1.85;
    }

    /* Print Break Rules */
    .page-cover {
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 250mm;
      padding: 24mm 16mm;
      border: 2px solid #00808033;
      border-radius: 12px;
      position: relative;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    }

    .session-page {
      page-break-before: always;
      break-before: page;
      padding-top: 4mm;
    }

    .page-closing {
      page-break-before: always;
      break-before: page;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 240mm;
      text-align: center;
      padding: 24mm 16mm;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #f8fafc;
    }

    .watermark {
      position: fixed;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 55pt;
      font-weight: 900;
      color: rgba(0, 128, 128, 0.04);
      z-index: -1;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
    }

    /* Cover Page Elements */
    .cover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #008080;
      padding-bottom: 12px;
    }
    .cover-logo {
      height: 48px;
      max-width: 140px;
      object-fit: contain;
    }
    .cover-fallback-logo {
      font-weight: 900;
      font-size: 18pt;
      color: #008080;
      letter-spacing: 1px;
    }
    .cover-badge {
      font-size: 9pt;
      font-weight: bold;
      color: #008080;
      background: rgba(0, 128, 128, 0.1);
      padding: 4px 12px;
      border-radius: 6px;
      border: 1px solid rgba(0, 128, 128, 0.2);
    }
    .cover-body {
      margin: auto 0;
      text-align: center;
      padding: 20px 0;
    }
    .cover-title {
      font-size: 24pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.4;
      margin-bottom: 16px;
    }
    .cover-subtitle {
      font-size: 13pt;
      color: #475569;
      margin-bottom: 8px;
    }
    .cover-meta {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 24px;
      font-size: 9.5pt;
      color: #64748b;
    }
    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5pt;
      color: #64748b;
    }

    /* Table of Contents */
    .toc-container {
      margin: 20px 0 30px 0;
      padding: 16px 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      page-break-inside: avoid;
    }
    .toc-header {
      font-size: 14pt;
      font-weight: bold;
      color: #006666;
      border-bottom: 2px solid #00808033;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .toc-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 10pt;
    }
    .toc-link {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      width: 100%;
      text-decoration: none;
      color: inherit;
    }
    .toc-link:hover, .toc-link:visited, .toc-link:active {
      color: inherit;
      text-decoration: none;
    }
    .toc-item-title {
      font-weight: 600;
      color: #0f172a;
    }
    .toc-item-meta {
      font-size: 8.5pt;
      color: #64748b;
    }

    /* Session Headings for Chapter View */
    .session-header-box {
      border-bottom: 2px solid #008080;
      padding-bottom: 14px;
      margin-bottom: 22px;
      text-align: center;
      page-break-after: avoid;
      break-after: avoid;
    }
    .session-title-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 4px 0 6px 0;
      direction: rtl;
    }
    .session-number-badge {
      width: 38px;
      height: 38px;
      min-width: 38px;
      min-height: 38px;
      max-width: 38px;
      max-height: 38px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 15pt;
      font-weight: 800;
      color: #008080;
      background: rgba(0, 128, 128, 0.08);
      border: 1.5px solid rgba(0, 128, 128, 0.25);
      border-radius: 8px;
      box-sizing: border-box;
      line-height: 1;
      text-align: center;
      user-select: none;
    }
    .session-title {
      font-size: 17pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      line-height: 1.4;
      text-align: center;
      word-break: break-word;
    }
    .session-ref {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 6px;
      text-align: center;
    }

    /* Headings */
    h1, .content-h1 {
      font-size: 16.5pt;
      font-weight: 800;
      color: #006666;
      border-bottom: 2px solid rgba(0, 128, 128, 0.2);
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
      break-after: avoid;
    }
    h2, .content-h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 22px;
      margin-bottom: 10px;
      page-break-after: avoid;
      break-after: avoid;
    }
    h3, .content-h3 {
      font-size: 11pt;
      font-weight: 700;
      color: #006666;
      margin-top: 16px;
      margin-bottom: 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    h4, .content-h4 {
      font-size: 10pt;
      font-weight: 600;
      color: #475569;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Paragraphs & Text */
    .content-p, p {
      margin: 0 0 10px 0;
      text-align: justify;
      text-justify: inter-word;
      unicode-bidi: isolate;
    }
    strong {
      font-weight: 800;
      color: #0f172a;
    }
    em {
      font-style: italic;
    }

    /* Callouts */
    .callout {
      margin: 14px 0;
      padding: 12px 14px;
      border-radius: 8px;
      border-right-width: 4px;
      border-right-style: solid;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .callout-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: bold;
      font-size: 10pt;
      margin-bottom: 6px;
    }
    .callout-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .callout-icon {
      width: 17px;
      height: 17px;
      flex-shrink: 0;
    }
    .callout-content {
      font-size: 9.5pt;
      line-height: 1.8;
    }
    .callout-content p {
      margin: 0 0 6px 0;
    }
    .callout-content p:last-child {
      margin-bottom: 0;
    }

    /* Tables */
    .table-container {
      margin: 14px 0;
      page-break-inside: auto;
      break-inside: auto;
      overflow-x: auto;
      direction: rtl;
    }
    .content-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.2pt;
      line-height: 1.55;
      page-break-inside: auto;
      break-inside: auto;
      direction: rtl;
    }
    .content-table thead {
      display: table-header-group;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .content-table tbody {
      direction: rtl;
    }
    .content-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
      direction: rtl;
    }
    .content-table th {
      background: #006666;
      color: #ffffff;
      padding: 6px 8px;
      text-align: right;
      font-weight: 700;
      font-size: 8.5pt;
      line-height: 1.55;
      border: 1px solid #005555;
      direction: rtl;
    }
    .content-table td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      text-align: right;
      vertical-align: middle;
      direction: rtl;
      font-size: 8.2pt;
      line-height: 1.55;
    }
    .content-table td p,
    .content-table th p {
      margin: 0;
      line-height: inherit;
      text-align: inherit;
    }
    .content-table code,
    .content-table .katex,
    .content-table .chem-inline {
      unicode-bidi: isolate;
      display: inline-block;
    }
    .content-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Lists */
    .content-ul, .content-ol, ul, ol {
      margin: 8px 0 14px 0;
      padding-right: 22px;
      padding-left: 0;
    }
    .content-li, li {
      margin-bottom: 4px;
      line-height: 1.8;
      unicode-bidi: isolate;
    }

    /* Code & Pre */
    .content-code, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 4px;
      font-size: 8.5pt;
      color: #0f766e;
      direction: ltr;
      display: inline-block;
      unicode-bidi: isolate;
    }
    .content-code-block, pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 8.5pt;
      line-height: 1.6;
      direction: ltr;
      text-align: left;
      overflow-x: auto;
      margin: 12px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* KaTeX Math Container & Typography Integration */
    .katex {
      direction: ltr !important;
      unicode-bidi: isolate;
      text-align: left;
      display: inline-block;
      font-size: 1.05em;
      line-height: 1.2;
      vertical-align: -0.1em;
      color: currentColor;
      overflow-wrap: normal !important;
      word-break: normal !important;
    }
    .katex-html {
      overflow-wrap: normal !important;
      word-break: normal !important;
    }
    .katex .base {
      white-space: nowrap;
    }
    .katex-display {
      direction: ltr !important;
      text-align: center;
      margin: 18px 0 !important;
      padding: 16px 20px !important;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow-x: auto;
      overflow-y: visible !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .katex-display > .katex {
      display: inline-block !important;
      margin: 4px 0 !important;
      max-width: 100%;
    }
    /* KaTeX Fraction Line Definition for high-resolution print */
    .katex .mfrac .frac-line {
      min-height: 0.05em;
      border-bottom-width: 0.05em !important;
    }

    /* Chemical & Chart Cards */
    .academic-chem-card, .academic-chart-card {
      margin: 14px 0;
      border: 1px solid #ccfbf1;
      border-right: 4px solid #0d9488;
      background: #f0fdfa;
      border-radius: 8px;
      padding: 12px 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .academic-chart-card {
      border-color: #e2e8f0;
      border-right-color: #6366f1;
      background: #f8fafc;
    }
    .chem-header, .chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(13, 148, 136, 0.2);
      padding-bottom: 6px;
      margin-bottom: 8px;
      font-weight: bold;
      color: #0f766e;
      font-size: 10pt;
    }
    .chem-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .chem-badge, .chart-badge {
      font-size: 8pt;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(13, 148, 136, 0.1);
      color: #0f766e;
      border: 1px solid rgba(13, 148, 136, 0.2);
    }
    .chem-body {
      font-size: 9pt;
    }
    .chem-structure-viewport {
      background: #ffffff;
      border: 1px solid #ccfbf1;
      border-radius: 6px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 8px 0;
      min-height: 120px;
      overflow: hidden;
      direction: ltr;
    }
    .chem-structure-viewport svg {
      max-width: 100%;
      max-height: 240px;
      height: auto;
      display: block;
    }
    .reaction-scheme-viewport {
      background: #ffffff;
      border: 1px solid #ccfbf1;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 8px 0;
      overflow-x: auto;
      direction: ltr;
    }
    .reaction-scheme-viewport svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .reaction-equation-text {
      font-size: 11pt;
      font-weight: 600;
      color: #0f766e;
      direction: ltr;
      text-align: center;
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid #ccfbf1;
      border-radius: 6px;
      letter-spacing: 0.5px;
      margin: 6px 0;
      width: 100%;
    }
    .reaction-participants-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      direction: ltr;
      padding: 8px 0;
      background: #ffffff;
      border: 1px solid #ccfbf1;
      border-radius: 6px;
      margin: 6px 0;
    }
    .reaction-participant-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 6px 8px;
      min-width: 90px;
    }
    .reaction-participant-item svg {
      max-width: 130px;
      max-height: 85px;
      height: auto;
    }
    .reaction-participant-name {
      font-size: 8pt;
      color: #475569;
      margin-top: 4px;
      direction: rtl;
    }
    .reaction-symbol {
      font-size: 16pt;
      font-weight: bold;
      color: #0d9488;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    .reaction-reagent-label {
      font-size: 7.5pt;
      color: #64748b;
      margin-bottom: 2px;
      font-weight: normal;
    }
    .chem-meta-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 12px 18px;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed rgba(13, 148, 136, 0.2);
    }
    .chem-field {
      margin: 2px 0;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .chem-label {
      color: #475569;
      font-weight: 600;
      font-size: 8.5pt;
    }
    .chem-formula {
      font-weight: bold;
      color: #0f766e;
      direction: ltr;
      font-size: 9pt;
    }
    .chem-value {
      font-weight: 600;
      color: #334155;
      font-size: 8.5pt;
    }
    .chem-fallback-notice {
      margin: 8px 0;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #fed7aa;
      border-radius: 6px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .chem-smiles-badge {
      background: #ffffff;
      border: 1px solid #ccfbf1;
      padding: 1px 6px;
      border-radius: 4px;
      color: #64748b;
      font-size: 7.5pt;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .chem-smiles-code {
      background: #ffffff;
      border: 1px solid #ccfbf1;
      padding: 2px 6px;
      border-radius: 4px;
      color: #0f766e;
      font-size: 8pt;
    }
    .chem-sar-box {
      margin-top: 8px;
      border-top: 1px dashed rgba(13, 148, 136, 0.2);
      padding-top: 6px;
    }
    .chem-sar-title {
      font-weight: bold;
      color: #0f766e;
      font-size: 8.5pt;
      margin-bottom: 4px;
    }

    /* Figures & Images */
    .content-figure {
      margin: 14px 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .content-img {
      max-width: 100%;
      max-height: 160mm;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      margin: 0 auto;
      display: block;
    }
    figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 6px;
    }

    /* Links & Dividers */
    .content-link {
      color: #008080;
      text-decoration: underline;
      font-weight: 600;
    }
    .content-hr, hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 16px 0;
    }
    .content-blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      border-right: 3px solid #94a3b8;
      background: #f8fafc;
      color: #475569;
      font-style: italic;
    }

    /* Closing Page Elements */
    .closing-logo-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 20px;
    }
    .closing-logo {
      height: 60px;
      max-width: 180px;
      object-fit: contain;
    }
    .closing-fallback-logo {
      font-weight: 800;
      font-size: 16pt;
      color: #e11d48;
      background: #ffe4e6;
      padding: 6px 14px;
      border-radius: 6px;
    }
    .closing-title {
      font-size: 18pt;
      font-weight: 800;
      color: #008080;
      margin-bottom: 12px;
    }
    .closing-desc {
      font-size: 10pt;
      color: #475569;
      max-width: 500px;
      line-height: 1.8;
      margin-bottom: 24px;
    }
    .closing-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 9.5pt;
      margin-bottom: 24px;
    }
    .closing-link {
      color: #008080;
      text-decoration: none;
      font-weight: bold;
    }
    .closing-disclaimer {
      font-size: 8pt;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      max-width: 440px;
    }
  `;
}

function renderClosingPage(): string {
  const logoBase64 = getAvanaLogoBase64();
  const logoTag = logoBase64
    ? `<img class="closing-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="closing-fallback-logo" data-error="missing-logo">AVANA [لوگو یافت نشد]</div>`;

  return `
    <div class="page-closing">
      <div class="closing-logo-wrap">
        ${logoTag}
      </div>
      <div class="closing-title">سامانه هوشمند یادگیری آوانا</div>
      <div class="closing-desc">
        آوانا بستر هوشمند آموزش و یادگیری دانشگاهی است که محتوای درسی را به خلاصه، درسنامه، فلش‌کارت و آزمون‌های تحلیلی تبدیل می‌کند.
      </div>
      <div class="closing-links">
        <div>وب‌سایت: <a class="closing-link" href="https://aavana.ir">https://aavana.ir</a></div>
        <div>کانال تلگرام: <a class="closing-link" href="https://t.me/AavanaClub">@AavanaClub</a></div>
        <div>اینستاگرام: <a class="closing-link" href="https://instagram.com/aavana.ir">@aavana.ir</a></div>
      </div>
      <div class="closing-disclaimer">
        کلیه حقوق مادی و معنوی این اثر متعلق به پلتفرم آوانا است. هرگونه بازنشر، تکثیر یا فروش بدون مجوز کتبی ممنوع و قابل پیگرد می‌باشد.
      </div>
    </div>
  `;
}

/**
 * Generates canonical academic HTML for a single lesson PDF.
 */
export function renderLessonPdfHtml(data: LessonPdfData): string {
  const fontBase64 = getEstedadFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const katexCss = getInlinedKatexCss();

  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");
  const effectiveRef = isValidAcademicReference(data.reference) ? data.reference!.trim() : null;
  const bodyHtml = markdownToSafeHtml(data.contentMarkdown);

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} - درسنامه آوانا</title>
  <style>
    ${getBaseStyles(fontBase64, katexCss)}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">درسنامه اختصاصی آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.title)}</div>
      ${data.moduleTitle ? `<div class="cover-subtitle">فصل: ${escapeHtml(data.moduleTitle)}</div>` : ""}
      ${data.courseName ? `<div class="cover-subtitle">دوره: ${escapeHtml(data.courseName)}</div>` : ""}
      <div class="cover-meta">
        <div>تاریخ تولید: ${escapeHtml(dateStr)}</div>
        ${effectiveRef ? `<div>مرجع: ${escapeHtml(effectiveRef)}</div>` : ""}
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="content-body">
    ${bodyHtml}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}

/**
 * Generates canonical academic HTML for an entire chapter (all sessions in order) in a single document.
 */
export function renderChapterPdfHtml(data: ChapterPdfData): string {
  const fontBase64 = getEstedadFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const katexCss = getInlinedKatexCss();

  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");

  const effectiveChapterRef = isValidAcademicReference(data.chapterReference)
    ? data.chapterReference!.trim()
    : isValidAcademicReference(data.reference)
    ? data.reference!.trim()
    : isValidAcademicReference(data.courseReference)
    ? data.courseReference!.trim()
    : null;

  // Filter and sort sessions strictly by sortOrder
  const validSessions = (data.sessions || [])
    .filter((s) => s.contentMarkdown && s.contentMarkdown.trim().length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Table of Contents HTML with true internal links to sessions
  const tocHtml = `
    <div class="toc-container">
      <div class="toc-header">فهرست جلسات فصل</div>
      <ul class="toc-list">
        ${validSessions
          .map(
            (s, idx) => `
          <li class="toc-item">
            <a href="#session-${idx + 1}" class="toc-link">
              <span class="toc-item-title">${escapeHtml(s.title || "بدون عنوان")}</span>
              <span class="toc-item-meta">${s.estimatedMinutes ? `${toPersianDigits(s.estimatedMinutes)} دقیقه مطالعه` : ""}</span>
            </a>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;

  // Resolve independent, guaranteed-unique session numbers for all sessions in this chapter
  const sessionNumbers = resolveChapterSessionNumbers(validSessions);

  // Render each session with a session divider and clean page break
  const sessionsHtml = validSessions
    .map((s, idx) => {
      const cleanedMarkdown = stripDuplicateLeadingHeading(s.contentMarkdown, s.title);
      const sessionContent = markdownToSafeHtml(cleanedMarkdown);
      const sessionRef = isValidAcademicReference(s.reference)
        ? s.reference!.trim()
        : null;
      const sessionNumber = sessionNumbers[idx];
      const cleanTitle = stripSessionTitlePrefix(s.title || "بدون عنوان");

      return `
      <section class="session-page" id="session-${idx + 1}">
        <div class="session-header-box">
          <div class="session-title-wrap">
            <div class="session-number-badge">${toPersianDigits(sessionNumber)}</div>
            <h2 class="session-title">${escapeHtml(cleanTitle)}</h2>
          </div>
          ${sessionRef ? `<div class="session-ref">مرجع: ${escapeHtml(sessionRef)}</div>` : ""}
        </div>
        <div class="session-content">
          ${sessionContent}
        </div>
      </section>
    `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.chapterTitle)} - فصل کامل آوانا</title>
  <style>
    ${getBaseStyles(fontBase64, katexCss)}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Chapter Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">مجموعه جلسات فصل آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.chapterTitle)}</div>
      <div class="cover-subtitle">دوره: ${escapeHtml(data.courseName)}</div>
      ${data.organizationName ? `<div class="cover-subtitle">سازمان: ${escapeHtml(data.organizationName)}</div>` : ""}
      <div class="cover-meta">
        <div>تعداد جلسات: ${toPersianDigits(validSessions.length)} جلسه</div>
        <div>تاریخ تولید: ${escapeHtml(dateStr)}</div>
        ${effectiveChapterRef ? `<div>مرجع: ${escapeHtml(effectiveChapterRef)}</div>` : ""}
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Table of Contents -->
  ${tocHtml}

  <!-- Sessions Content -->
  <div class="chapter-sessions-container">
    ${sessionsHtml}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}

/**
 * Generates canonical academic HTML for a review summary PDF.
 */
export function renderReviewSummaryPdfHtml(data: ReviewSummaryPdfData): string {
  const fontBase64 = getEstedadFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const katexCss = getInlinedKatexCss();

  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");

  const sectionsHtml: string[] = [];

  // Overview
  if (data.overview) {
    sectionsHtml.push(`
      <div class="callout callout-key-point" style="border-right-color: #0d9488; background-color: rgba(13, 148, 136, 0.08);">
        <div class="callout-header" style="color: #0f766e;">
          <span class="callout-title">چکیده یک‌دقیقه‌ای مبحث</span>
        </div>
        <div class="callout-content">${markdownToSafeHtml(data.overview)}</div>
      </div>
    `);
  }

  // Sections
  if (Array.isArray(data.sections)) {
    for (const sec of data.sections) {
      if (sec.title) {
        sectionsHtml.push(`<h2>${escapeHtml(sec.title)}</h2>`);
      }

      if (sec.keyPoints && sec.keyPoints.length > 0) {
        sectionsHtml.push(`
          <div class="callout callout-key-point" style="border-right-color: #0d9488; background-color: rgba(13, 148, 136, 0.08);">
            <div class="callout-header" style="color: #0f766e;">نکات کلیدی و مفاهیم اصلی</div>
            <ul class="content-ul">
              ${sec.keyPoints.map((p) => `<li>${markdownToSafeHtml(p)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.mechanisms && sec.mechanisms.length > 0) {
        sectionsHtml.push(`
          <div class="callout callout-understanding" style="border-right-color: #0284c7; background-color: rgba(2, 132, 199, 0.08);">
            <div class="callout-header" style="color: #0284c7;">مکانیزم‌ها و فرآیندها</div>
            <ul class="content-ul">
              ${sec.mechanisms.map((m) => `<li>${markdownToSafeHtml(m)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.classifications && sec.classifications.length > 0) {
        sectionsHtml.push(`
          <div class="callout callout-tip" style="border-right-color: #f59e0b; background-color: rgba(245, 158, 11, 0.08);">
            <div class="callout-header" style="color: #d97706;">طبقه‌بندی‌ها و دسته‌ها</div>
            <ul class="content-ul">
              ${sec.classifications.map((c) => `<li>${markdownToSafeHtml(c)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.comparisons && sec.comparisons.length > 0) {
        for (const comp of sec.comparisons) {
          sectionsHtml.push(`
            <div class="table-container" dir="rtl">
              <h3>${escapeHtml(comp.title || "جدول مقایسه‌ای")}</h3>
          `);
          if (comp.headers && comp.rows) {
            sectionsHtml.push('<table class="content-table" dir="rtl"><thead><tr>');
            for (const h of comp.headers) {
              sectionsHtml.push(`<th>${escapeHtml(h)}</th>`);
            }
            sectionsHtml.push("</tr></thead><tbody>");
            for (const row of comp.rows) {
              sectionsHtml.push("<tr>");
              for (const cell of row) {
                sectionsHtml.push(`<td>${markdownToSafeHtml(cell)}</td>`);
              }
              sectionsHtml.push("</tr>");
            }
            sectionsHtml.push("</tbody></table>");
          }
          sectionsHtml.push("</div>");
        }
      }

      if (sec.memorizationPoints && sec.memorizationPoints.length > 0) {
        sectionsHtml.push(`
          <div class="callout callout-supplementary" style="border-right-color: #6366f1; background-color: rgba(99, 102, 241, 0.08);">
            <div class="callout-header" style="color: #4f46e5;">نکات حفظی و رمزگذاری‌ها</div>
            <ul class="content-ul">
              ${sec.memorizationPoints.map((mp) => `<li>${markdownToSafeHtml(mp)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.examPoints && sec.examPoints.length > 0) {
        sectionsHtml.push(`
          <div class="callout callout-warning" style="border-right-color: #f59e0b; background-color: rgba(245, 158, 11, 0.08);">
            <div class="callout-header" style="color: #d97706;">نکات کنکوری و دام‌های تستی</div>
            <ul class="content-ul">
              ${sec.examPoints.map((ep) => `<li>${markdownToSafeHtml(ep)}</li>`).join("")}
            </ul>
          </div>
        `);
      }
    }
  }

  // Final Takeaways
  if (data.finalTakeaways && data.finalTakeaways.length > 0) {
    sectionsHtml.push(`
      <div class="callout callout-clinical-point" style="border-right-color: #10b981; background-color: rgba(16, 185, 129, 0.08);">
        <div class="callout-header" style="color: #059669;">جمع‌بندی و نتیجه‌گیری نهایی</div>
        <ul class="content-ul">
          ${data.finalTakeaways.map((t) => `<li>${markdownToSafeHtml(t)}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} - خلاصه مرور آوانا</title>
  <style>
    ${getBaseStyles(fontBase64, katexCss)}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">خلاصه مرور سریع آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.title)}</div>
      ${data.moduleTitle ? `<div class="cover-subtitle">فصل: ${escapeHtml(data.moduleTitle)}</div>` : ""}
      ${data.courseName ? `<div class="cover-subtitle">دوره: ${escapeHtml(data.courseName)}</div>` : ""}
      <div class="cover-meta">
        <div>تاریخ تولید: ${escapeHtml(dateStr)}</div>
        ${data.estimatedReadingMinutes ? `<div>زمان مطالعه: ${data.estimatedReadingMinutes} دقیقه</div>` : ""}
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="content-body">
    ${sectionsHtml.join("\n")}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}
