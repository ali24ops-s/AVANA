/**
 * Shared Rich Content & Markdown renderer for AVANA.
 *
 * Supports:
 * - GitHub-Flavored Markdown (GFM) tables, lists, blockquotes, code blocks
 * - LaTeX / KaTeX math rendering ($...$, $$...$$, \\(...\\), \\[...\\])
 * - Safe delimiter normalization outside code blocks
 * - High-contrast responsive styling for RTL Persian text with isolated LTR math
 * - Both Full (block) and Inline rendering modes
 * - Production-safe KaTeX error handling (throwOnError: false)
 */

import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { LessonCallout, type CalloutType } from "./LessonCallout.js";
import { remarkLessonCallouts } from "./remarkLessonCallouts.js";
import {
  parseChemicalCodeContent,
  parseReactionCodeContent,
  parseChartCodeContent,
  validateEducationalChart,
  normalizeRichContent,
  normalizeMarkdownTables,
  isScientificToken,
  unwrapJsonContent,
} from "@avana/domain";

export { normalizeRichContent, normalizeMarkdownTables, isScientificToken, unwrapJsonContent, parseChemicalCodeContent, parseReactionCodeContent };

const LazyChemicalStructureBlock = React.lazy(() =>
  import("../chemistry/ChemicalStructureBlock.js").then((m) => ({
    default: m.ChemicalStructureBlock,
  })),
);

const LazyReactionBlock = React.lazy(() =>
  import("../chemistry/ReactionBlock.js").then((m) => ({
    default: m.ReactionBlock,
  })),
);

import { ChemicalErrorBoundary } from "../chemistry/ChemicalFallbackBlock.js";

const LazyChemicalFallbackBlock = React.lazy(() =>
  import("../chemistry/ChemicalFallbackBlock.js").then((m) => ({
    default: m.ChemicalFallbackBlock,
  })),
);

const LazyChartBlock = React.lazy(() =>
  import("../chart/ChartBlock.js").then((m) => ({
    default: m.ChartBlock,
  })),
);

import { ChartErrorBoundary } from "../chart/ChartErrorBoundary.js";

const LazyChartFallbackBlock = React.lazy(() =>
  import("../chart/ChartFallbackBlock.js").then((m) => ({
    default: m.ChartFallbackBlock,
  })),
);

const LazyHeartAnatomyDiagram = React.lazy(() =>
  import("../anatomy/HeartAnatomyDiagram.js").then((m) => ({
    default: m.HeartAnatomyDiagram,
  })),
);

const LazyBloodFlowVisualizer = React.lazy(() =>
  import("../anatomy/BloodFlowVisualizer.js").then((m) => ({
    default: m.BloodFlowVisualizer,
  })),
);

const LazyAnatomyQuizCard = React.lazy(() =>
  import("../anatomy/AnatomyQuizCard.js").then((m) => ({
    default: m.AnatomyQuizCard,
  })),
);

export interface RichContentProps {
  content?: string | null;
  className?: string;
  inline?: boolean;
  dir?: "rtl" | "ltr" | "auto";
  enableLessonCallouts?: boolean;
  compactTables?: boolean;
}

export type MarkdownRendererProps = RichContentProps;

function isSafeHref(href?: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Shared rich content component for rendering AI-generated & user-authored markdown with LaTeX.
 */
function RichContentComponent({
  content,
  className = "",
  inline = false,
  dir = "rtl",
  enableLessonCallouts = false,
  compactTables = false,
}: RichContentProps) {
  if (content === null || content === undefined || content === "") {
    return null;
  }

  const isCompactTable = compactTables || className.includes("compact-table");

  const rawText = typeof content === "string" ? content : String(content);
  const normalized = React.useMemo(() => normalizeRichContent(rawText), [rawText]);

  const remarkPlugins = React.useMemo(() => {
    const plugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["remarkPlugins"]> = [
      remarkGfm,
      remarkMath,
    ];
    if (enableLessonCallouts && !inline) {
      plugins.push(remarkLessonCallouts);
    }
    return plugins;
  }, [enableLessonCallouts, inline]);

  const rehypePlugins = React.useMemo<[typeof rehypeKatex, { throwOnError: boolean; strict: boolean }]>(
    () => [
      rehypeKatex,
      {
        throwOnError: false,
        strict: false,
      },
    ],
    [],
  );

  if (inline) {
    return (
      <span
        className={`rich-content-inline ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} break-words [overflow-wrap:anywhere] [unicode-bidi:isolate] inline-block max-w-full ${className}`.trim()}
        dir={dir}
      >
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={[rehypePlugins]}
          components={{
            p: ({ children }) => <span className="inline leading-relaxed whitespace-pre-line break-words">{children}</span>,
            h1: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h2: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h3: ({ children }) => <span className="font-bold inline block mb-1">{children}</span>,
            h4: ({ children }) => <span className="font-bold inline">{children}</span>,
            h5: ({ children }) => <span className="font-bold inline">{children}</span>,
            h6: ({ children }) => <span className="font-bold inline">{children}</span>,
            ul: ({ children }) => <ul className="list-disc pr-4 my-1 text-inherit">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pr-4 my-1 text-inherit">{children}</ol>,
            li: ({ children }) => <li className="my-0.5 leading-relaxed break-words [unicode-bidi:isolate]">{children}</li>,
            code: ({ children, ...props }) => (
              <code
                className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs font-mono text-teal-900 dark:text-teal-300 inline-block align-baseline [unicode-bidi:isolate]"
                dir="ltr"
                {...props}
              >
                {children}
              </code>
            ),
            a: ({ children, href, ...props }) => (
              <a
                href={isSafeHref(href) ? href : "#"}
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2 font-medium break-words"
                target="_blank"
                rel="noreferrer noopener"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div
      className={`markdown-content-body rich-content-full ${dir === "rtl" ? "rtl text-right" : dir === "ltr" ? "ltr text-left" : ""} leading-relaxed break-words [overflow-wrap:anywhere] ${className}`.trim()}
      dir={dir}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypePlugins]}
        components={{
          ...(enableLessonCallouts
            ? {
                callout: ({
                  type,
                  title,
                  children,
                }: {
                  type?: unknown;
                  title?: string;
                  children?: ReactNode;
                }) => (
                  <LessonCallout type={type as CalloutType} title={title}>
                    {children}
                  </LessonCallout>
                ),
              }
            : {}),
          h1: ({ children, ...props }) => (
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] mt-8 mb-4 first:mt-0 pb-3 border-b border-[var(--color-border)] tracking-tight leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              className="text-xl sm:text-2xl font-bold text-[var(--color-text)] mt-7 mb-3.5 leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              className="text-lg sm:text-xl font-bold text-[#006666] dark:text-teal-300 mt-6 mb-2.5 leading-snug break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </h3>
          ),
          p: ({ children, ...props }) => (
            <p
              className="text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200 leading-[2.1] mb-5 font-normal tracking-normal whitespace-pre-line break-words [unicode-bidi:isolate]"
              {...props}
            >
              {children}
            </p>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-extrabold text-[var(--color-text)] dark:text-white [unicode-bidi:isolate]" {...props}>
              {children}
            </strong>
          ),
          a: ({ children, href, ...props }) => (
            <a
              href={isSafeHref(href) ? href : "#"}
              className="text-[#006666] dark:text-teal-300 hover:text-[#008080] dark:hover:text-teal-200 underline underline-offset-4 decoration-[#008080]/40 dark:decoration-teal-500/50 hover:decoration-[#006666] dark:hover:decoration-teal-400 transition-colors font-medium break-words"
              target="_blank"
              rel="noreferrer noopener"
              {...props}
            >
              {children}
            </a>
          ),
          hr: (props) => (
            <hr className="my-6 border-[var(--color-border)]" {...props} />
          ),
          img: ({ alt, ...props }) => (
            <img
              className="rounded-card max-w-full h-auto my-4 border border-[var(--color-border)] shadow-md mx-auto"
              alt={alt || ""}
              {...props}
            />
          ),
          ul: ({ children, ...props }) => (
            <ul
              className="list-disc pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="list-decimal pr-6 pl-0 mb-5 space-y-2 text-[15px] sm:text-base text-[var(--color-text)] dark:text-slate-200"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-[2.05] my-1 text-[var(--color-text)] dark:text-slate-200 break-words [unicode-bidi:isolate]" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-5 border-r-4 border-teal-600 dark:border-teal-500 bg-[#e0f2f2]/60 dark:bg-teal-950/30 px-5 py-3.5 rounded-l-card text-[var(--color-text)] dark:text-slate-200 leading-[2] border border-teal-500/20 shadow-xs break-words"
              {...props}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children, ...props }) => {
            // If the code child is a chemical, smiles, or reaction block, unwrap <pre>
            if (
              React.isValidElement<{ className?: string }>(children) &&
              typeof children.props?.className === "string"
            ) {
              const cls = children.props.className;
              if (
                cls.includes("language-chemical") ||
                cls.includes("language-smiles") ||
                cls.includes("language-reaction") ||
                cls.includes("language-rxn") ||
                cls.includes("language-chemical-reaction") ||
                cls.includes("language-chart") ||
                cls.includes("language-charts") ||
                cls.includes("language-chart-json") ||
                cls.includes("language-anatomy") ||
                cls.includes("language-bloodflow") ||
                cls.includes("language-blood-flow") ||
                cls.includes("language-anatomy-quiz")
              ) {
                return <>{children}</>;
              }
            }
            return (
              <pre
                className="my-4 p-4 rounded-card bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 overflow-x-auto text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200 leading-relaxed shadow-xs"
                dir="ltr"
                {...props}
              >
                {children}
              </pre>
            );
          },
          code: ({ children, className, ...props }) => {
            const match = /language-([a-zA-Z0-9_-]+)/.exec(className || "");
            const lang = match ? match[1].toLowerCase() : "";
            if (lang === "chemical" || lang === "smiles") {
              const rawContent =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                  ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                  : "";
              const parsedStructure = parseChemicalCodeContent(rawContent, lang);
              if (parsedStructure) {
                return (
                  <ChemicalErrorBoundary
                    fallback={
                      <LazyChemicalFallbackBlock
                        rawContent={rawContent}
                        language={lang}
                        reason="عدم امکان ترسیم یا تجزیه ساختار مولکولی"
                      />
                    }
                  >
                    <React.Suspense
                      fallback={
                        <div
                          className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                          dir="rtl"
                        >
                          در حال بارگذاری ساختار مولکولی...
                        </div>
                      }
                    >
                      <LazyChemicalStructureBlock structure={parsedStructure} />
                    </React.Suspense>
                  </ChemicalErrorBoundary>
                );
              }

              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-4 p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 text-xs"
                      dir="rtl"
                    >
                      در حال بارگذاری...
                    </div>
                  }
                >
                  <LazyChemicalFallbackBlock
                    rawContent={rawContent}
                    language={lang}
                    reason="عدم انطباق با الگوی ورودی فرمول شیمیایی"
                  />
                </React.Suspense>
              );
            }

            if (lang === "reaction" || lang === "rxn" || lang === "chemical-reaction") {
              const rawContent =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                  ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                  : "";
              const parsedReaction = parseReactionCodeContent(rawContent, lang);
              if (parsedReaction) {
                return (
                  <ChemicalErrorBoundary
                    fallback={
                      <LazyChemicalFallbackBlock
                        rawContent={rawContent}
                        language={lang}
                        reason="عدم امکان ترسیم یا پردازش واکنش شیمیایی"
                      />
                    }
                  >
                    <React.Suspense
                      fallback={
                        <div
                          className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                          dir="rtl"
                        >
                          در حال بارگذاری واکنش شیمیایی...
                        </div>
                      }
                    >
                      <LazyReactionBlock reaction={parsedReaction} />
                    </React.Suspense>
                  </ChemicalErrorBoundary>
                );
              }

              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-4 p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 text-xs"
                      dir="rtl"
                    >
                      در حال بارگذاری...
                    </div>
                  }
                >
                  <LazyChemicalFallbackBlock
                    rawContent={rawContent}
                    language={lang}
                    reason="عدم انطباق با الگوی ساختاری واکنش شیمیایی"
                  />
                </React.Suspense>
              );
            }

            if (lang === "chart" || lang === "charts" || lang === "chart-json") {
              const rawContent =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                  ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                  : "";
              const parsedChart = parseChartCodeContent(rawContent, lang);
              if (parsedChart) {
                const validation = validateEducationalChart(parsedChart);
                if (validation.valid && validation.chart) {
                  return (
                    <ChartErrorBoundary
                      fallback={
                        <LazyChartFallbackBlock
                          rawContent={rawContent}
                          language={lang}
                          title={parsedChart.title}
                          reason="خطا در رندر گرافیکی نمودار آموزشی"
                        />
                      }
                    >
                      <React.Suspense
                        fallback={
                          <div
                            className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                            dir="rtl"
                          >
                            در حال بارگذاری نمودار...
                          </div>
                        }
                      >
                        <LazyChartBlock chart={validation.chart} />
                      </React.Suspense>
                    </ChartErrorBoundary>
                  );
                }

                return (
                  <React.Suspense
                    fallback={
                      <div
                        className="my-4 p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 text-xs"
                        dir="rtl"
                      >
                        در حال بارگذاری...
                      </div>
                    }
                  >
                    <LazyChartFallbackBlock
                      rawContent={rawContent}
                      language={lang}
                      title={parsedChart.title}
                      reason={validation.errors.join("، ")}
                    />
                  </React.Suspense>
                );
              }

              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-4 p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 text-xs"
                      dir="rtl"
                    >
                      در حال بارگذاری...
                    </div>
                  }
                >
                  <LazyChartFallbackBlock
                    rawContent={rawContent}
                    language={lang}
                    reason="عدم انطباق با ساختار داده‌ای استاندارد JSON نمودار"
                  />
                </React.Suspense>
              );
            }

            if (lang === "anatomy" || lang === "heart-anatomy") {
              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                      dir="rtl"
                    >
                      در حال بارگذاری تصویر آناتومی...
                    </div>
                  }
                >
                  <LazyHeartAnatomyDiagram />
                </React.Suspense>
              );
            }

            if (lang === "bloodflow" || lang === "blood-flow") {
              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                      dir="rtl"
                    >
                      در حال بارگذاری مسیر جریان خون...
                    </div>
                  }
                >
                  <LazyBloodFlowVisualizer />
                </React.Suspense>
              );
            }

            if (lang === "anatomy-quiz") {
              return (
                <React.Suspense
                  fallback={
                    <div
                      className="my-6 p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs text-[var(--color-text-muted)] animate-pulse"
                      dir="rtl"
                    >
                      در حال بارگذاری سؤال تصویری...
                    </div>
                  }
                >
                  <LazyAnatomyQuizCard />
                </React.Suspense>
              );
            }

            return (
              <code
                className={`bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-xs sm:text-sm font-mono text-teal-900 dark:text-teal-300 inline-block align-baseline [unicode-bidi:isolate] ${className || ""}`.trim()}
                {...props}
              >
                {children}
              </code>
            );
          },
          // GFM Table Components with High Contrast & RTL Persian Text Alignment
          table: ({ children, ...props }) => (
            <div
              className={`table-scroll-container ${isCompactTable ? "compact-table my-2.5 sm:my-3" : "my-3.5 sm:my-4"} w-full max-w-full overflow-x-auto rounded-card border border-[var(--color-border,#E2E7EA)] shadow-xs bg-[var(--color-surface)] overscroll-x-contain`}
              dir={dir || "rtl"}
            >
              <table
                className={`content-table ${isCompactTable ? "compact-table" : ""} w-full min-w-full !m-0 !my-0 border-collapse border border-[var(--color-border,#E2E7EA)] ${dir === "ltr" ? "text-left" : "text-right"} ${isCompactTable ? "text-xs sm:text-[13px]" : "text-[13px] sm:text-sm"} leading-relaxed`}
                dir={dir || "rtl"}
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead
              className="bg-[var(--color-surface-warm)] text-[var(--color-text)] font-black border-b border-[var(--color-border,#E2E7EA)]"
              {...props}
            >
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody
              className="divide-y divide-[var(--color-border,#E2E7EA)] bg-[var(--color-surface)]"
              {...props}
            >
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr
              className="hover:bg-[var(--color-surface-warm)]/80 even:bg-[var(--color-surface-warm)]/30 transition-colors"
              {...props}
            >
              {children}
            </tr>
          ),
          th: ({ children, style, ...props }) => {
            const cellStyle =
              dir === "ltr"
                ? style
                : style?.textAlign === "left"
                ? { ...style, textAlign: "right" as const }
                : style;
            return (
              <th
                className={`border border-[var(--color-border,#E2E7EA)] ${isCompactTable ? "px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs" : "px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-[13px]"} ${dir === "ltr" ? "text-left" : "text-right"} font-black text-[var(--color-text)] tracking-wide align-top bg-[var(--color-surface-warm)] [unicode-bidi:isolate] whitespace-normal`}
                dir={dir || "rtl"}
                style={cellStyle}
                {...props}
              >
                {children}
              </th>
            );
          },
          td: ({ children, style, ...props }) => {
            const cellStyle =
              dir === "ltr"
                ? style
                : style?.textAlign === "left"
                ? { ...style, textAlign: "right" as const }
                : style;
            return (
              <td
                className={`border border-[var(--color-border,#E2E7EA)] ${isCompactTable ? "px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-[13px]" : "px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-sm"} ${dir === "ltr" ? "text-left" : "text-right"} text-[var(--color-text)] dark:text-slate-200 align-top break-words [unicode-bidi:isolate]`}
                dir={dir || "rtl"}
                style={cellStyle}
                {...props}
              >
                {children}
              </td>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

const MemoizedRichContent = React.memo(RichContentComponent);

export { MemoizedRichContent as RichContent, MemoizedRichContent as MarkdownRenderer };
